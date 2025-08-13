# vcardai – Visiting Card to Contacts

Turn photos of visiting/business cards into structured contacts you can download as a VCF and import into your phone. The app uses AI to extract names, titles, phones, email, and more. Built with React (Vite) and Python serverless functions on Vercel.

• Live demo (Production): https://www.vcardai.app

## Project write-up

### The problem / social issue
Contact details on paper business cards often never make it into digital address books. Manual entry is slow and error‑prone, creating friction for networking and limiting access—especially for users dealing with language barriers, low‑vision scenarios, or large backlogs of cards. This leads to lost opportunities and wasted time.

### Our solution and impact
Card Scanner lets anyone snap or upload a card image and instantly get clean, editable contact data. It supports multilingual text and normalizes phone numbers. Users can review, tweak fields, and download a standards‑compliant vCard (VCF) in one click—eliminating manual entry and helping preserve connections.

### Intended users
- Professionals and students who network frequently
- Small businesses digitizing contact records
- Users who receive cards in multiple languages
- Event organizers and teams processing many cards quickly

## Key features

- Image upload (drag & drop or click) with file validation (JPG/PNG, up to 10 MB)
- Automatic QR scanning for website links on cards
- AI‑powered extraction of: name, titles, organization, phones, email, address, website
- Phone normalization to E.164 when possible
- Editable review form before export
- One‑click VCF (vCard 3.0) download
- Dark mode UI and responsive layout
- Deployed on Vercel with built‑in Analytics

## Tech stack

- Frontend: React 18 + Vite, Tailwind CSS, shadcn/ui, Lucide icons
- Backend: Vercel Serverless Functions (Python)
- AI: OpenAI API (GPT‑4o) for vision + text extraction
- Deployment: Vercel
- Analytics: @vercel/analytics

## Architecture overview

```
frontend (React + Vite)
   └─ fetch('/api/upload')        # POST image -> JSON contact fields
   └─ fetch('/api/generate-vcf')  # POST JSON -> VCF file download

vercel serverless (Python)
   ├─ api/upload.py               # vision extraction via OpenAI
   └─ api/generate-vcf.py         # vCard creation + return as attachment
```

## Project structure

```
vcard_v2/
├── api/
│   ├── upload.py          # Image upload + AI extraction (serverless)
│   └── generate-vcf.py    # VCF generation (serverless)
├── backend/               # Optional FastAPI app (for local/testing)
├── src/
│   ├── App.jsx            # Main UI + flows
│   ├── main.jsx           # Entry point (+ Vercel Analytics)
│   └── components/ui/     # shadcn/ui components
├── public/
├── vercel.json            # Vercel configuration (Vite static + API)
├── package.json
└── README.md
```

## Setup & local development

### Prerequisites
- Node.js 18+ (20+ recommended)
- npm or pnpm
- An OpenAI API key (for production and when running serverless locally)

### 1) Install dependencies
```bash
npm install
# or
pnpm install
```

### 2) Environment variables
The AI extractor requires `OPENAI_API_KEY`.

- On Vercel (recommended): add it in Project Settings → Environment Variables, or via CLI:
```bash
vercel env add OPENAI_API_KEY
```

- For local emulation of serverless with Vercel CLI:
```bash
vercel env pull .env.local
# then run: npx vercel dev
```

### 3) Run locally (frontend only)
```bash
npm run dev
```
This serves the React app at http://localhost:5173. Serverless endpoints are available when running with `npx vercel dev`.

### 4) Build for production
```bash
npm run build
```
The static site is emitted to `dist/`.

## API reference

### POST /api/upload
Uploads an image and returns extracted contact fields.

- Content-Type: `multipart/form-data`
- Field: `file` (image/jpeg or image/png)

Example response
```json
{
  "name": "Jane Doe",
  "titles": ["Senior Product Manager"],
  "organization": "Acme Corp",
  "phone_numbers": ["+15551234567"],
  "email": "jane@acme.com",
  "address": "123 Market St, City, ST 94111, USA",
  "url": "https://acme.com"
}
```

Possible errors
```json
{ "error": "No image data found" }
{ "error": "Invalid image format" }
{ "error": "❌ This doesn't seem like a business card. Please upload a clear business card photo." }
{ "error": "Error extracting business card information: ..." }
```

### POST /api/generate-vcf
Accepts JSON contact info and returns a `text/vcard` file (vCard 3.0) as an attachment.

Request body
```json
{
  "name": "Jane Doe",
  "titles": ["Senior Product Manager"],
  "organization": "Acme Corp",
  "phone_numbers": ["+15551234567"],
  "email": "jane@acme.com",
  "address": "123 Market St, City, ST 94111, USA",
  "url": "https://acme.com"
}
```

Responses
- 200: VCF file download (Content-Disposition: attachment; filename="Jane_Doe.vcf")
- 400: `{ "error": "Name is required to generate vCard" }`
- 500: `{ "error": "..." }`

## Vercel Analytics

This project integrates Vercel Analytics for privacy‑preserving page analytics. The app includes:
- `@vercel/analytics` in the frontend (`src/main.jsx`, `src/App.jsx`)
- No additional configuration is needed on Vercel; metrics appear in the project’s Analytics tab

## Deployment (Vercel)

1. Push your code to GitHub
2. Import the repo into Vercel and set `Framework Preset: Vite`
3. Add `OPENAI_API_KEY` in Project Settings → Environment Variables
4. Deploy

vercel.json is already configured to:
- Build with `npm run build`, output `dist/`
- Serve serverless Python functions in `api/`
- Add permissive CORS headers for `/api/*`

## How to use

1. Upload a clear photo of a visiting/business card (JPG/PNG)
2. The app will scan for QR codes (to auto‑fill website) and send the image to the AI extractor
3. Review and edit extracted fields
4. Download the contact as a `.vcf` and import into your contacts app

## Accessibility & privacy

- High‑contrast dark mode available
- Extraction happens via serverless functions; do not upload sensitive documents
- Avoid PII beyond business contact information

