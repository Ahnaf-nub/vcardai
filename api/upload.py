import base64
import json
import io
from PIL import Image
from openai import OpenAI
import os
import phonenumbers
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def encode_image_data(image_data):
    """Encode image data to base64"""
    image = Image.open(io.BytesIO(image_data)).convert("RGB")
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def extract_business_card_info(base64_img):
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional document parser. Extract all visible information "
                        "from business card images into structured JSON. Preserve full titles, org names, addresses. "
                        "For any phone number detected, include the country code by assuming it's a real-world number. "
                        "Support text in multiple languages including Bengali/Bangla, English, and other languages. "
                        "Always return valid JSON regardless of the language of the text."
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
Support text in any language including Bengali/Bangla.

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
- Support text in multiple languages including Bengali/Bangla, English, and others.
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
    except json.JSONDecodeError as e:
        # If JSON parsing fails, return a basic structure
        return {
            "name": "Unable to parse name",
            "titles": [],
            "organization": "Unable to parse organization",
            "phone_numbers": [],
            "email": "",
            "address": "",
            "url": ""
        }
    except Exception as e:
        # If OpenAI API fails, return error structure
        raise Exception(f"OpenAI API error: {str(e)}")

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Set CORS headers
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            
            # Get content length
            content_length = int(self.headers['Content-Length'])
            
            # Parse multipart form data (simplified for this example)
            # In production, you'd want to use a proper multipart parser
            raw_data = self.rfile.read(content_length)
            
            # Extract image data from multipart form
            # This is a simplified approach - in production use proper multipart parsing
            boundary = self.headers['Content-Type'].split('boundary=')[1]
            parts = raw_data.split(f'--{boundary}'.encode())
            
            image_data = None
            for part in parts:
                if b'Content-Type: image/' in part:
                    # Extract image data
                    image_start = part.find(b'\r\n\r\n') + 4
                    image_data = part[image_start:-2]  # Remove trailing \r\n
                    break
            
            if not image_data:
                self.wfile.write(json.dumps({"error": "No image data found"}).encode('utf-8'))
                return
            
            # Validate image
            try:
                Image.open(io.BytesIO(image_data))
            except Exception:
                self.wfile.write(json.dumps({"error": "Invalid image format"}).encode('utf-8'))
                return
            
            base64_img = encode_image_data(image_data)
            
            # Check if it's a business card
            try:
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
                    self.wfile.write(json.dumps({"error": "❌ This doesn't seem like a business card. Please upload a clear business card photo."}).encode('utf-8'))
                    return
            except Exception as e:
                # If classification fails, continue with extraction
                print(f"Classification error: {e}")
            
            # Extract business card info
            try:
                data = extract_business_card_info(base64_img)
                self.wfile.write(json.dumps(data).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"error": f"Error extracting business card information: {str(e)}"}).encode('utf-8'))
            
        except Exception as e:
            # Always return JSON even in case of server error
            try:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Server error: {str(e)}"}).encode('utf-8'))
            except:
                # Last resort - if even JSON response fails
                pass
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
