import json
import phonenumbers
from http.server import BaseHTTPRequestHandler

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

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Parse JSON data
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # Validate that we have at least a name
            if not data.get("name"):
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Name is required to generate vCard"}).encode())
                return
            
            # Generate VCF content
            vcf = create_vcf_content(data)
            filename = data.get('name', 'contact').replace(' ', '_').replace('/', '_')
            
            # Send VCF file
            self.send_response(200)
            self.send_header('Content-type', 'text/vcard')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', f'attachment; filename={filename}.vcf')
            self.end_headers()
            self.wfile.write(vcf.encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
