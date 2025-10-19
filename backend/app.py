from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
import boto3, os
from uuid import uuid4
from dotenv import load_dotenv
app = FastAPI()

load_dotenv("keys.env")

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION"),
)
BUCKET = os.getenv("BUCKET_NAME", "giggles-s3-bucket")

@app.post("/uploads")
async def upload(file: UploadFile = File(...)):
    key = f"uploads/{uuid4()}_{file.filename}"
    s3.upload_fileobj(file.file, BUCKET, key, ExtraArgs={"ContentType": file.content_type})
    return {"key": key}

@app.get("/videos")
def list_videos():
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix="uploads/")
    videos = []
    for obj in response.get("Contents", []):
        key = obj["Key"]
        url = f"https://{BUCKET}.s3.amazonaws.com/{key}"
        videos.append({"key": key, "url": url})
    return {"videos": videos}

@app.get("/health")
def health():
    return {"status": "ok"}

