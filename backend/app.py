import base64
import json
import io
from PIL import Image
from fastapi import FastAPI, UploadFile, Form, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import os
import phonenumbers
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Mount the React build directory as static files
app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
app.mount("/static", StaticFiles(directory="dist"), name="static")


def encode_image(file: UploadFile):
    # Reset file pointer to beginning
    file.file.seek(0)
    image = Image.open(file.file).convert("RGB")
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def extract_business_card_info(base64_img):
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a professional document parser. Extract all visible information "
                    "from business card images into structured JSON. Preserve full titles, org names, addresses. "
                    "For any phone number detected, include the country code by assuming it's a real-world number."
                )
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": """
Please extract the following fields from this business card image. 
Return a raw, valid JSON object — do NOT wrap it in markdown or backticks.

{
  "name": "Full Name",
  "titles": ["Full job title 1", "Full job title 2"],
  "organization": "Full organization name",
  "phone_numbers": ["+880..."],
  "email": "email@example.com",
  "address": "Full address with postal code and country",
  "url": "https://website.com"
}

⚠️ Instructions:
- Include full strings exactly as shown in the image. Don't shorten or summarize anything.
- If a field spans multiple lines (e.g., title, address), merge them into one full string.
- If a field is missing or unreadable, omit it completely.
- For phone numbers, detect and add the appropriate country code if missing.
                        """
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_img}"
                        }
                    }
                ]
            }
        ],
        temperature=0.2
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.strip("`").split("json")[-1].strip()

    return json.loads(content)


def normalize_phone_numbers(numbers, default_region="BD"):
    normalized = []
    for num in numbers:
        try:
            parsed = phonenumbers.parse(num, default_region)
            if phonenumbers.is_valid_number(parsed):
                normalized.append(phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164))
        except Exception:
            pass
    return normalized


def create_vcf_content(contact_info):
    lines = ["BEGIN:VCARD", "VERSION:3.0"]
    if name := contact_info.get("name"):
        parts = name.split(" ", 1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ""
        lines.append(f"N:{last};{first};;;")
        lines.append(f"FN:{name}")
    for title in contact_info.get("titles", []):
        lines.append(f"TITLE:{title}")
    if org := contact_info.get("organization"):
        lines.append(f"ORG:{org}")
    phones = normalize_phone_numbers(contact_info.get("phone_numbers", []))
    for phone in phones:
        lines.append(f"TEL;TYPE=CELL:{phone}")
    if email := contact_info.get("email"):
        lines.append(f"EMAIL:{email}")
    if address := contact_info.get("address"):
        lines.append(f"ADR:;;{address}")
    if url := contact_info.get("url"):
        lines.append(f"URL:{url}")
    lines.append("END:VCARD")
    return "\n".join(lines)


@app.get("/", response_class=HTMLResponse)
def index():
    with open("dist/index.html") as f:
        return f.read()

@app.post("/upload")
async def upload_image(file: UploadFile):
    try:
        # Validate file type
        if not file.content_type.startswith("image/"):
            return {"error": "Please upload a valid image file (JPG, PNG, etc.)"}
        
        base64_img = encode_image(file)

        # Improved system prompt & check
        classification = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert image content classifier. Determine whether the uploaded image clearly shows a business card. "
                        "Respond ONLY with 'yes' or 'no'. Do NOT explain anything."
                    )
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Does this image clearly contain a business card (not a person, selfie, scenery, or unrelated object)?"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_img}"
                            }
                        }
                    ]
                }
            ],
            temperature=0
        )

        is_card = classification.choices[0].message.content.strip().lower()
        if not is_card.startswith("yes"):
            return {"error": "❌ This doesn't seem like a business card. Please upload a clear business card photo."}

        # Proceed with extraction
        data = extract_business_card_info(base64_img)
        return data

    except Exception as e:
        return {"error": f"Error processing image: {str(e)}"}

@app.post("/generate-vcf")
async def generate_vcf(request: Request):
    try:
        print("Received request to generate vCard")
        data = await request.json()
        print(f"Request data: {data}")
        
        # Validate that we have at least a name
        if not data.get("name"):
            print("No name provided in request")
            return Response(
                content=json.dumps({"error": "Name is required to generate vCard"}),
                media_type="application/json",
                status_code=400
            )
        
        vcf = create_vcf_content(data)
        filename = data.get('name', 'contact').replace(' ', '_').replace('/', '_')
        
        print(f"Generated vCard content: {vcf}")
        print(f"Filename: {filename}")
        
        return Response(
            content=vcf,
            media_type="text/vcard",
            headers={
                "Content-Disposition": f"attachment; filename={filename}.vcf"
            }
        )
    except Exception as e:
        print(f"Error generating vCard: {str(e)}")
        return Response(
            content=json.dumps({"error": str(e)}),
            media_type="application/json",
            status_code=500
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

