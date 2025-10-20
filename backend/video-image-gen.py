from openai import OpenAI
import os
from dotenv import load_dotenv
import base64

load_dotenv('keys.env')
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def image_gen():
    response = client.responses.create(
    model="gpt-4.1-mini",
    input="Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools=[{"type": "image_generation"}],
    )
    image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
    ]

    if image_data:
        image_base64 = image_data[0]
        with open("cat_and_otter.png", "wb") as f:
            f.write(base64.b64decode(image_base64))