from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import boto3, os
from uuid import uuid4
from dotenv import load_dotenv
from supabase import create_client

app = FastAPI()

# Allow requests from mobile/web during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; tighten in prod
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
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # service key for server
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Upload to S3, then insert video row in Supabase
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
        # videos(id, user_id, s3_key, url)
        sb.table("videos").insert({"id": vid, "user_id": user_id, "s3_key": key, "url": url, "caption": caption}).execute()
        return {"id": vid, "key": key, "url": url}
    except Exception as e:
        raise HTTPException(500, str(e))

# Feed (latest videos with counters; persisted like_count/comment_count)
@app.get("/videos")
def list_videos(limit: int = 20, cursor: str | None = None):
    q = sb.table("videos").select("*, users!videos_user_id_fkey(username)")
    if cursor:
        # simple keyset on created_at if you stored it; else omit
        q = q.lt("created_at", cursor)
    data = q.execute().data
    return {"videos": data}

# Video detail + top comments + # of likes and comments
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

    # counts: prefer persisted, else recompute
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

    # comments list; tolerate missing table
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
    # recompute and persist like_count on videos
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


# All videos liked by a user (for bootstrapping liked state)
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
        # recompute and persist comment_count on videos
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

@app.get("/health")
def health():
    return {"status": "ok"}
