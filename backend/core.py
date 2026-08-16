import easyocr
import pytesseract
from PIL import Image, ImageEnhance
import cv2
import numpy as np
import ollama
import json
import re
import os
import io
import logging
import fitz  # PyMuPDF - Handles PDF rendering

# Configure logging so you can debug later if something breaks
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ExamExtractor:
    """
    The Final Core Engine for Examora.
    Handles PDFs and Images automatically.
    """
    def __init__(self):
        logger.info("Initializing EasyOCR with Metal (MPS) support...")
        # gpu=True automatically detects M3 Metal
        self.reader = easyocr.Reader(['en'], gpu=True)
        logger.info("EasyOCR ready.")

    # ---------- PDF TO IMAGE CONVERTER (In-Memory) ----------
    def _pdf_to_numpy(self, pdf_path, dpi=300, page_number=0):
        """
        Opens a PDF, renders the requested page at 300 DPI,
        and returns a NumPy array (RGB) that EasyOCR can read directly.
        """
        try:
            doc = fitz.open(pdf_path)
            page = doc[page_number]
            # Scale matrix: 300 DPI = 300/72 zoom factor
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            # Convert pixmap to PIL Image, then to NumPy
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            return np.array(img)
        except Exception as e:
            logger.error(f"Failed to convert PDF page {page_number + 1} to image: {e}")
            raise e

    def _pdf_to_numpy_all_pages(self, pdf_path, dpi=300):
        """
        Renders every page in a PDF to NumPy arrays for page-by-page OCR.
        """
        try:
            doc = fitz.open(pdf_path)
            return [self._pdf_to_numpy(pdf_path, dpi=dpi, page_number=index) for index in range(len(doc))]
        except Exception as e:
            logger.error(f"Failed to convert PDF to images: {e}")
            raise e

    # ---------- IMAGE PREPROCESSING (for Tesseract fallback) ----------
    def _preprocess_image(self, image_input):
        """
        Accepts either a file path (string) or a NumPy array.
        Converts to grayscale, increases contrast, applies binary threshold.
        Returns a PIL Image.
        """
        if isinstance(image_input, str):
            img = Image.open(image_input).convert('L')
        else:  # Assume it's a NumPy array
            img = Image.fromarray(image_input).convert('L')
        
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.5)  # Boost contrast
        open_cv_image = np.array(img)
        # Otsu's thresholding
        _, thresh = cv2.threshold(open_cv_image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return Image.fromarray(thresh)

    # ---------- OCR PIPELINE (Unified for PDFs & Images) ----------
    def extract_text(self, file_path):
        """
        Detects file type. If PDF, renders to image first.
        Primary: EasyOCR. Fallback: Tesseract.
        """
        logger.info(f"Processing file: {file_path}")
        
        # 1. Convert to image array(s) if PDF
        if file_path.lower().endswith('.pdf'):
            logger.info("PDF detected. Rendering all pages to images...")
            image_arrays = self._pdf_to_numpy_all_pages(file_path)
        else:
            image_arrays = [file_path]  # Pass the path string for images

        # 2. Try EasyOCR page by page
        page_texts = []
        for page_index, ocr_input in enumerate(image_arrays, start=1):
            try:
                result = self.reader.readtext(ocr_input, detail=0, paragraph=True)
                page_text = " ".join(result).strip()
                logger.info(f"EasyOCR extracted {len(page_text)} characters from page {page_index}.")
            except Exception as e:
                logger.error(f"EasyOCR failed on page {page_index}: {e}")
                page_text = ""

            page_texts.append(f"--- Page {page_index} ---\n{page_text}".strip())

        text_easy = "\n".join(page_texts).strip()

        # 3. If EasyOCR gave too little, fallback to Tesseract using the first page only
        if len(text_easy) < 20:
            logger.info("EasyOCR output too short. Falling back to Tesseract on the first page with preprocessing.")
            try:
                first_page_input = image_arrays[0]
                # Preprocess the first page only (works for both path string and numpy array)
                processed_img = self._preprocess_image(first_page_input)
                # --psm 6 = Assume a single uniform text block
                text_tess = pytesseract.image_to_string(processed_img, config='--psm 6')
                text_tess = text_tess.strip()
                logger.info(f"Tesseract extracted {len(text_tess)} characters.")
                return text_tess
            except Exception as e:
                logger.error(f"Tesseract fallback failed: {e}")
                return text_easy  # Return whatever EasyOCR got from all pages
        else:
            return text_easy

    # ---------- LLM STRUCTURED EXTRACTION ----------
    def parse_to_json(self, raw_text):
        """
        Sends raw OCR text to Qwen2 via Ollama.
        Forces JSON output with the exact 10-field schema.
        Returns a Python dictionary.
        """
        system_prompt = """
You are a high-precision data extractor for ANY Indian examination admit card.

STRICT OUTPUT FORMAT RULE:
Return a FLAT JSON object. 
DO NOT create any nested objects (like "center": { "building_name": ... }).
The key "center" must have a STRING value, like this:
"center": "JAI ARIHANT GROUP OF INSTITUTIONS, BARELLIY ROAD, HALDUCHAUR HALDWANI UTTARAKHAND-263142"

Your JSON keys must be exactly these:
exam_title, exam_date, exam_start_time, reporting_time, center, gate_details, required_documents, extracted_instructions, ocr_confidence

PARSING RULES (Follow strictly):

1. exam_title: Look for "Course", "Post Applied For", "Exam", "Test". Extract the specific title (e.g., "Android Development", "Technician Grade-II").

2. exam_date: Look for "Date of Test", "Exam Date". Convert: DD-MM-YYYY → YYYY-MM-DD . Repair OCR: "017zzoig" → "01-09-2019".

3. exam_start_time: Look for time range like "2.00 PM – 4.00 PM". Extract ONLY the START time. Convert "2.00 PM" → "02:00 PM".

4. reporting_time: Look for "Reporting Time" or "Gate Entry Time". If OCR noise like "Q1.0/ PM" → convert to "01:00 PM". If missing, infer 60 min before start.

5. center (CRITICAL - MUST BE A STRING):
   - Combine the venue name + full address into ONE comma-separated string.
   - Format: "Name, Street, Locality, City, State, PIN".
   - Example: "iON DIGITALZone iDZ Vishnupur, 555 Indira institute of techology, vishnupuri gate, Nanded, Maharashtra 431601".
   - DO NOT split into building_name, street_address, city, etc.
   - DO NOT include names of officials (Dr., Director, Invigilator, Controller).

6. gate_details: Look for "Gate Closure Time" or gate numbers. Extract as a string (e.g., "Gate closes at 01:20 PM").

7. required_documents: Return LIST of physical items student must carry. Include:
- Admit Card / Hall Ticket (always required)
- Original valid photo ID proof with available options 
- Passport size photo 
- Ball Point Transparent Pen 
- Water bottle 
If ID options exist, expand them.
Example: "Original valid photo ID proof: PAN Card, Aadhaar Card, Passport, Driving License, Voter ID"
Do NOT output only: "Original valid ID proof"
Reject: roll number, application number, signature.

8. extracted_instructions: Maximum 6 instructions.
Create short exam-day instructions summary points for students. Do NOT copy admit card paragraphs.Convert into simple actions.
Use: "You must..." , "Carry..." , "Do not..." 
Include only: reporting time, gate closing, required items,  prohibited items, dress rules, important exam rules
Example: "You shall not be permitted after gate closing", "You must reach the centre before {gate closing time}. Entry is not allowed after gate closing."
Remove: legal text, page details, eligibility text, generic warnings, word "Candidates". "The Admit Card is provisional, subject to satisfying the eligibility conditions as given in the Prospectus/Information Bulletin","Candidates are advised to verify the location of the test venue, a day in advance so that they do not face any problem on the day of the test"

9. ocr_confidence: 0.95 if clear text, 0.85 if some noise, 0.70 if heavy noise.

OUTPUT FORMAT: ONLY valid JSON. No extra text. Use null for missing fields.
"""
        
        try:
            response = ollama.chat(
                model='qwen2.5:3b',
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': f"Extract from this OCR text:\n{raw_text}"}
                ],
                format='json'  # CRITICAL: Forces strict JSON
            )
            # Parse the JSON string
            data = json.loads(response['message']['content'])
            
            # Ensure all keys exist (defensive programming)
            required_keys = ['exam_title', 'exam_date', 'exam_start_time', 'reporting_time', 
                            'center', 'gate_details', 'required_documents', 
                            'extracted_instructions', 'ocr_confidence']
            for key in required_keys:
                if key not in data:
                    data[key] = None
            return data
        except Exception as e:
            logger.error(f"LLM parsing failed: {e}")
            # Return a safe fallback dict if Ollama crashes
            return {key: None for key in ['exam_title', 'exam_date', 'exam_start_time', 
                                          'reporting_time', 'center', 
                                          'gate_details', 'required_documents', 
                                          'extracted_instructions', 'ocr_confidence']}

    # ---------- CONFIDENCE SCORING (High/Low) ----------
    def score_confidence(self, data):
        """
        Takes the extracted dict, adds a 'confidence' key with per-field scores.
        High: matches regex or has strong keywords.
        Low: null, too short, or just numbers.
        """
        conf = {}
        date_pattern = r'^\d{4}-\d{2}-\d{2}$'
        time_pattern = r'^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$'

        for key, value in data.items():
            if key == 'ocr_confidence':  # Skip scoring the confidence field itself
                continue
            if value is None:
                conf[key] = 'low'
                continue
            if isinstance(value, list):
                conf[key] = 'high' if len(value) > 0 else 'low'
                continue
            if isinstance(value, str):
                if key == 'exam_date':
                    conf[key] = 'high' if re.match(date_pattern, value) else 'low'
                elif key in ['exam_start_time', 'reporting_time']:
                    conf[key] = 'high' if re.match(time_pattern, value) else 'low'
                elif key == 'center':
                    # Must have at least 3 commas and some letters
                    if value.count(',') >= 3 and re.search(r'[a-zA-Z]', value):
                        conf[key] = 'high'
                    else:
                        conf[key] = 'low'
                else:
                    # General text: must have > 3 chars and at least one letter
                    if len(value) > 3 and re.search(r'[a-zA-Z]', value):
                        conf[key] = 'high'
                    else:
                        conf[key] = 'low'
            else:
                conf[key] = 'low'
        
        # Inject the confidence map into the original data
        data['confidence'] = conf
        return data

    # ---------- MASTER ORCHESTRATOR (Now accepts PDFs) ----------
    def process_file(self, file_path):
        """
        The single method you call from the outside.
        Accepts PDF or Image path.
        Runs Render (if PDF) -> OCR -> LLM -> Confidence.
        Returns a fully structured dict ready for JSON/DB.
        """
        # 1. Extract raw text
        raw_text = self.extract_text(file_path)
        
        # 2. Parse to JSON
        parsed_data = self.parse_to_json(raw_text)
        
        # 3. Add confidence scores
        final_data = self.score_confidence(parsed_data)

        # 3a. Regex fallback for missing center and reporting_time
        if final_data.get('center') is None:
            center_match = re.search(r'(?:Venue|Centre)\s*[:\-]?\s*(.{1,100})', raw_text, re.IGNORECASE | re.DOTALL)
            if center_match:
                final_data['center'] = center_match.group(1).strip()

        if final_data.get('reporting_time') is None:
            reporting_match = re.search(
                r'(?:Reporting Time|Gate Entry Time)\s*[:\-]?\s*([0-1]?\d[:.]\d{2}\s*[AP]M)',
                raw_text,
                re.IGNORECASE,
            )
            if reporting_match:
                final_data['reporting_time'] = reporting_match.group(1).replace('.', ':').upper().strip()
        
        # 4. (Optional) Attach raw text for debugging in Phase 2
        final_data['raw_ocr_text'] = raw_text
        
        return final_data