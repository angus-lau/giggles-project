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

# Feed (latest videos with counters)
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
    # video info + uploader username
    v = (
        sb.table("videos")
        .select("*, users!videos_user_id_fkey(username)")
        .eq("id", video_id)
        .single()
        .execute()
        .data
    )

    # counts
    like_count = (
        sb.table("likes").select("count()", count="exact").eq("video_id", video_id).execute().count
    )
    comment_count = (
        sb.table("comments").select("count()", count="exact").eq("video_id", video_id).execute().count
    )

    # top comments
    cs = (
        sb.table("comments")
        .select("id, user_id, text, created_at")
        .eq("video_id", video_id)
        .order("created_at", desc=True)
        .limit(comments_limit)
        .execute()
        .data
    )

    v["like_count"] = like_count
    v["comment_count"] = comment_count
    return {"video": v, "comments": cs}

# Like / Unlike
@app.post("/videos/{video_id}/like")
def like(video_id: str, user_id: str):
    sb.table("likes").upsert({"video_id": video_id, "user_id": user_id}).execute()
    # read the updated counter (assumes DB trigger maintains like_count)
    vr = sb.table("videos").select("like_count").eq("id", video_id).single().execute().data
    cnt = (vr or {}).get("like_count")
    return {"ok": True, "like_count": cnt}

@app.delete("/videos/{video_id}/like")
def unlike(video_id: str, user_id: str):
    sb.table("likes").delete().eq("video_id", video_id).eq("user_id", user_id).execute()
    vr = sb.table("videos").select("like_count").eq("id", video_id).single().execute().data
    cnt = (vr or {}).get("like_count")
    return {"ok": True, "like_count": cnt}

# Comment
@app.post("/videos/{video_id}/comments")
def add_comment(video_id: str, user_id: str, text: str):
    row = sb.table("comments").insert({"video_id": video_id, "user_id": user_id, "text": text}).execute().data[0]
    return {"comment": row}

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
