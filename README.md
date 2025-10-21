
# Giggles MVP Project

TikTok style mobile app built with **Expo (React Native)** on the front end with FastAPI on the backend. The backend connects to **Supabase** to handle user, video, likes, comments, follows saves and images endpoint. All the videos and images are stored on **AWS S3**. Made to demonstrate skills to Giggles.


## Features

- Persistent likes, comments, saves, followings/followers
- AI image and video generation
- Endless videos


## Install dependencies

To deploy this project run

```bash
  pip install -r backend/requirements.txt
```


## Run Locally

Clone the project

```bash
  git clone https://github.com/angus-lau/giggles-project
```

Go to the project directory

```bash
  cd giggles-project
```

Run the backend
```bash
python3 -m venv venv
source venv/bin/activate 
pip install -r backend/requirements.txt
uvicorn --app-dir backend app:app --host 0.0.0.0 --port 8000 --reload --env-file backend/keys.env
```

Run the front end
```bash
cd gigglesproj
npm install
npx run dev
```

