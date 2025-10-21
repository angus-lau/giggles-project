from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
import boto3, os, time, re
from uuid import uuid4
from dotenv import load_dotenv
from supabase import create_client

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv("keys.env")

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION"),
)
BUCKET = os.getenv("BUCKET_NAME", "giggles-s3-bucket")


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.post("/uploads")
async def upload(
    user_id: str = Form(...),
    file: UploadFile = File(...),
    caption: str | None = Form(None),
):
    vid = str(uuid4())
    key = f"uploads/{user_id}/{vid}_{file.filename}"
    try:
        s3.upload_fileobj(file.file, BUCKET, key, ExtraArgs={"ContentType": file.content_type})
        url = f"https://{BUCKET}.s3.amazonaws.com/{key}"
        sb.table("videos").insert({"id": vid, "user_id": user_id, "s3_key": key, "url": url, "caption": caption}).execute()
        return {"id": vid, "key": key, "url": url}
    except Exception as e:
        raise HTTPException(500, str(e))

# Feed
@app.get("/videos")
def list_videos(limit: int = 20, cursor: str | None = None):
    q = sb.table("videos").select("*, users!videos_user_id_fkey(username)")
    if cursor:
        # simple keyset on created_at if you stored it; else omit
        q = q.lt("created_at", cursor)
    data = q.execute().data
    return {"videos": data}

# Video detail
@app.get("/videos/{video_id}")
def video_detail(video_id: str, comments_limit: int = 10):
    # video + uploader username; return JSON 404 if not found
    try:
        v_resp = (
            sb.table("videos")
            .select("*, users!videos_user_id_fkey(username)")
            .eq("id", video_id)
            .single()
            .execute()
        )
        v = v_resp.data
    except Exception as e:
        raise HTTPException(404, "video not found")

    if not v:
        raise HTTPException(404, "video not found")

    like_count = int(v.get("like_count") or 0)
    comment_count = int(v.get("comment_count") or 0)
    if like_count == 0:
        try:
            like_count = (
                sb.table("likes").select("*", count="exact").eq("video_id", video_id).execute().count
                or 0
            )
        except Exception:
            like_count = 0
    if comment_count == 0:
        try:
            comment_count = (
                sb.table("comments").select("*", count="exact").eq("video_id", video_id).execute().count
                or 0
            )
        except Exception:
            comment_count = 0
    cs = []
    try:
        cs = (
            sb.table("comments")
            .select("id, user_id, text, created_at, username, users!comments_user_id_fkey(username)")
            .eq("video_id", video_id)
            .order("created_at", desc=True)
            .limit(comments_limit)
            .execute()
            .data
            or []
        )
    except Exception:
        cs = []

    v["like_count"] = like_count
    v["comment_count"] = comment_count
    return {"video": v, "comments": cs}

# Like / Unlike
@app.post("/videos/{video_id}/like")
def like(video_id: str, user_id: str):
    sb.table("likes").upsert({"video_id": video_id, "user_id": user_id}).execute()
    lc = (
        sb.table("likes").select("*", count="exact").eq("video_id", video_id).execute().count
        or 0
    )
    sb.table("videos").update({"like_count": lc}).eq("id", video_id).execute()
    return {"ok": True, "like_count": lc}

@app.delete("/videos/{video_id}/like")
def unlike(video_id: str, user_id: str):
    sb.table("likes").delete().eq("video_id", video_id).eq("user_id", user_id).execute()
    lc = (
        sb.table("likes").select("*", count="exact").eq("video_id", video_id).execute().count
        or 0
    )
    sb.table("videos").update({"like_count": lc}).eq("id", video_id).execute()
    return {"ok": True, "like_count": lc}


# All videos liked by a user
@app.get("/users/{user_id}/likes")
def user_likes(user_id: str, limit: int = 1000):
    try:
        rows = (
            sb.table("likes")
            .select("video_id")
            .eq("user_id", user_id)
            .limit(limit)
            .execute()
            .data
            or []
        )
        return {"video_ids": [r.get("video_id") for r in rows if r.get("video_id")]}
    except Exception as e:
        raise HTTPException(500, f"failed to load likes: {e}")

# Comment
@app.post("/videos/{video_id}/comments")
def add_comment(video_id: str, user_id: str, text: str):
    if not (video_id and user_id and (text or '').strip()):
        raise HTTPException(400, "missing video_id, user_id, or text")
    try:
        user = sb.table("users").select("username").eq("id", user_id).single().execute().data
        username = user["username"] if user else None
        res = (
            sb.table("comments")
            .insert({"video_id": video_id, "user_id": user_id, "username": username, "text": text})
            .execute()
        )
        data = getattr(res, 'data', None) or []
        row = data[0] if data else {"video_id": video_id, "user_id": user_id, "text": text, "username": username}
        cc = (
            sb.table("comments").select("*", count="exact").eq("video_id", video_id).execute().count
            or 0
        )
        sb.table("videos").update({"comment_count": cc}).eq("id", video_id).execute()
        return {"comment": row, "comment_count": cc}
    except Exception as e:
        raise HTTPException(500, f"failed to insert comment: {e}")


# User profile videos
@app.get("/users/{user_id}/videos")
def user_videos(user_id: str, limit: int = 20, cursor: str | None = None):
    q = sb.table("videos").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit)
    if cursor:
        q = q.lt("created_at", cursor)
    return {"videos": q.execute().data}

# Upload image to S3
@app.post("/images/upload")
async def upload_image(
    user_id: str = Form(...),
    file: UploadFile = File(...),
):
    img_id = str(uuid4())
    key = f"images/{user_id}/{img_id}_{file.filename}"
    try:
        try:
            file.file.seek(0)
        except Exception:
            pass
        s3.upload_fileobj(file.file, BUCKET, key, ExtraArgs={"ContentType": file.content_type})
        url = f"https://{BUCKET}.s3.amazonaws.com/{key}"
        row = {
            "id": img_id,
            "user_id": user_id,
            "storage_path": key,
            "url": url,
            "mime_type": file.content_type,
        }
        sb.table("images").insert(row).execute()
        return {"image": row}
    except Exception as e:
        raise HTTPException(500, f"image upload failed: {e}")


# List images for a user
@app.get("/images")
def list_images(user_id: str, limit: int = 60, cursor: str | None = None):
    try:
        q = (
            sb.table("images")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if cursor:
            q = q.lt("created_at", cursor)
        data = q.execute().data or []
        return {"images": data}
    except Exception as e:
        raise HTTPException(500, f"failed to list images: {e}")

# Search images by keywords
@app.get("/images/search")
def search_images(user_id: str, q: str, limit: int = 60):
    try:
        tokens = [t for t in re.split(r"[^A-Za-z0-9]+", q.lower()) if t]
        if not tokens:
            return {"images": []}
        
        or_clauses = []
        for t in tokens:
            or_clauses.append(f"storage_path.ilike.%{t}%")
            or_clauses.append(f"url.ilike.%{t}%")
        or_filter = ",".join(or_clauses)
        qry = (
            sb.table("images")
            .select("*")
            .eq("user_id", user_id)
            .or_(or_filter)
            .order("created_at", desc=True)
            .limit(limit)
        )
        data = qry.execute().data or []
        return {"images": data}
    except Exception as e:
        raise HTTPException(500, f"failed to search images: {e}")

@app.delete("/images/{image_id}")
def delete_image(image_id: str, user_id: str):
    try:
        row = (
            sb.table("images").select("id,storage_path,user_id").eq("id", image_id).single().execute().data
        )
        if not row or row.get("user_id") != user_id:
            raise HTTPException(404, "image not found")
        key = row.get("storage_path")
        if key:
            try:
                s3.delete_object(Bucket=BUCKET, Key=key)
            except Exception:
                pass
        sb.table("images").delete().eq("id", image_id).execute()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"failed to delete image: {e}")

# User profile summary
@app.get("/users/{user_id}")
def user_profile(user_id: str):
    try:
        u = (
            sb.table("users")
            .select("id, username, avatar_url, aura") 
            .eq("id", user_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        try:
            u = (
                sb.table("users")
                .select("id, username, avatar_url")
                .eq("id", user_id)
                .single()
                .execute()
                .data
            )
        except Exception:
            raise HTTPException(404, "user not found")

    if not u:
        raise HTTPException(404, "user not found")

    try:
        posts = (
            sb.table("videos").select("*", count="exact").eq("user_id", user_id).execute().count
            or 0
        )
    except Exception:
        posts = 0

    # followers/following counts
    followers = 0
    following = 0
    try:
        followers = (
            sb.table("follows").select("*", count="exact").eq("followed_id", user_id).execute().count
            or 0
        )
    except Exception:
        followers = 0
    try:
        following = (
            sb.table("follows").select("*", count="exact").eq("follower_id", user_id).execute().count
            or 0
        )
    except Exception:
        following = 0

    return {
        "user": {
            "id": u.get("id"),
            "username": u.get("username"),
            "avatar_url": u.get("avatar_url"),
            "aura": u.get("aura") or 0,
            "posts": int(posts),
            "followers": int(followers),
            "following": int(following),
        }
    }

@app.get("/users/{target_id}/is_following")
def is_following(target_id: str, follower_id: str):
    try:
        rows = (
            sb.table("follows")
            .select("follower_id")
            .eq("follower_id", follower_id)
            .eq("followed_id", target_id)
            .limit(1)
            .execute()
            .data or []
        )
        print("IS_FOLLOWING ROWS", rows)
        return {"is_following": len(rows) > 0}
    except Exception as e:
        return {"is_following": False, "warning": f"{e}"}

@app.post("/users/{target_id}/follow")
def follow_user(target_id: str, follower_id: str):
    if target_id == follower_id:
        raise HTTPException(400, "cannot follow self")
    try:
        res = (
            sb.table("follows")
            .upsert({"follower_id": follower_id, "followed_id": target_id}, on_conflict="follower_id,followed_id")
            .execute()
        )
        print("UPSERT FOLLOW RESP", getattr(res, "data", None), getattr(res, "status_code", None))
    except Exception as e:
        print("UPSERT FOLLOW ERROR", repr(e))
        try:
            res2 = sb.table("follows").insert({"follower_id": follower_id, "followed_id": target_id}).execute()
            print("INSERT FOLLOW RESP", getattr(res2, "data", None), getattr(res2, "status_code", None))
        except Exception as e2:
            print("INSERT FOLLOW ERROR", repr(e2))
            raise HTTPException(500, f"failed to write follows: {e2}")

    followers = 0
    last_err = None
    for _ in range(3):
        try:
            followers = (
                sb.table("follows")
                .select("*", count="exact")
                .eq("followed_id", target_id)
                .execute()
                .count or 0
            )
            break
        except Exception as e:
            last_err = e
            time.sleep(0.08)

    print("FOLLOW POST", {"target": target_id, "follower": follower_id})
    print("FOLLOW COUNT", {"followers": followers, "err": str(last_err) if last_err else None})
    return {"followers": int(followers)}

@app.delete("/users/{target_id}/follow")
def unfollow_user(target_id: str, follower_id: str):
    if target_id == follower_id:
        raise HTTPException(400, "cannot unfollow self")
    try:
        dres = sb.table("follows").delete().eq("follower_id", follower_id).eq("followed_id", target_id).execute()
        print("DELETE FOLLOW RESP", getattr(dres, "data", None), getattr(dres, "status_code", None))
    except Exception as e:
        print("DELETE FOLLOW ERROR", repr(e))
        raise HTTPException(500, f"failed to delete follows: {e}")

    followers = 0
    last_err = None
    for _ in range(3):
        try:
            followers = (
                sb.table("follows")
                .select("*", count="exact")
                .eq("followed_id", target_id)
                .execute()
                .count or 0
            )
            break
        except Exception as e:
            last_err = e
            time.sleep(0.08)

    print("FOLLOW DELETE", {"target": target_id, "follower": follower_id})
    print("FOLLOW COUNT", {"followers": followers, "err": str(last_err) if last_err else None})
    return {"followers": int(followers)}

@app.get("/health")
def health():
    return {"status": "ok"}
