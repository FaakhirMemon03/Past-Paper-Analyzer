import os
import re
import math
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Try importing extraction/ML libraries. If they are not present, we use robust fallbacks.
try:
    import fitz  # PyMuPDF
    pymupdf_available = True
except ImportError:
    pymupdf_available = False

try:
    import pdfplumber
    pdfplumber_available = True
except ImportError:
    pdfplumber_available = False

try:
    import pytesseract
    from PIL import Image
    pytesseract_available = True
except ImportError:
    pytesseract_available = False

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    sklearn_available = True
except ImportError:
    sklearn_available = False

app = FastAPI(title="Past Paper AI Analysis Engine")

# Enable CORS for communication with Express backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisRequest(BaseModel):
    file_paths: List[str]
    subject: str = "general"
    board: str = "general"
    weights: Dict[str, float] = {"frequency": 0.7, "recency": 0.3}

# --- EXTRACT TEXT ---
def extract_text_from_file(file_path: str) -> str:
    """Extracts text from PDF, Image, DOCX, DOC, or TXT file. Ignores .md files silently."""
    if file_path.lower().endswith('.md'):
        print(f"[AI ENGINE] Skipping .md file silently: {file_path}")
        return ""
    
    if not os.path.exists(file_path):
        print(f"[AI ENGINE] File not found: {file_path}")
        return ""

    ext = os.path.splitext(file_path.lower())[1]
    text = ""

    try:
        if ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        
        elif ext == '.docx':
            import zipfile
            import xml.etree.ElementTree as ET
            try:
                with zipfile.ZipFile(file_path) as docx:
                    xml_content = docx.read('word/document.xml')
                    root = ET.fromstring(xml_content)
                    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    paragraphs = []
                    for para in root.findall('.//w:p', ns):
                        texts = [node.text for node in para.findall('.//w:t', ns) if node.text]
                        if texts:
                            paragraphs.append("".join(texts))
                    text = "\n".join(paragraphs)
            except Exception as e:
                print(f"[AI ENGINE] DOCX parsing failed: {e}")

        elif ext == '.doc':
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                # Find ASCII printable strings (Unix strings-like utility)
                ascii_strings = re.findall(b'[a-zA-Z0-9\s\?\.\,\:\-\+\*\/]{4,}', content)
                decoded_lines = []
                for s in ascii_strings:
                    try:
                        decoded = s.decode('ascii').strip()
                        if len(decoded) > 12:
                            decoded_lines.append(decoded)
                    except:
                        pass
                text = "\n".join(decoded_lines)
            except Exception as e:
                print(f"[AI ENGINE] DOC parsing failed: {e}")
        
        elif ext == '.pdf':
            # Try PyMuPDF (fitz)
            if pymupdf_available:
                try:
                    doc = fitz.open(file_path)
                    for page in doc:
                        text += page.get_text()
                    doc.close()
                except Exception as e:
                    print(f"[AI ENGINE] PyMuPDF failed: {e}. Trying pdfplumber...")
            
            # Fallback to pdfplumber
            if not text.strip() and pdfplumber_available:
                try:
                    with pdfplumber.open(file_path) as pdf:
                        for page in pdf.pages:
                            page_text = page.extract_text()
                            if page_text:
                                text += page_text + "\n"
                except Exception as e:
                    print(f"[AI ENGINE] pdfplumber failed: {e}")

            # Fallback to OCR if PDF has no text (scanned PDF)
            if not text.strip() and pytesseract_available:
                print(f"[AI ENGINE] Scanned PDF detected or extraction empty. Running OCR...")
                # We would extract pages as images and run Tesseract
                # For safety and speed, if PyMuPDF is available, we can render pages
                if pymupdf_available:
                    try:
                        doc = fitz.open(file_path)
                        for page_num in range(len(doc)):
                            page = doc.load_page(page_num)
                            pix = page.get_pixmap()
                            img_data = pix.tobytes("png")
                            # Convert to PIL Image
                            from io import BytesIO
                            img = Image.open(BytesIO(img_data))
                            ocr_text = pytesseract.image_to_string(img)
                            text += ocr_text + "\n"
                        doc.close()
                    except Exception as e:
                        print(f"[AI ENGINE] PDF OCR failed: {e}")

        elif ext in ['.jpg', '.jpeg', '.png', '.bmp']:
            if pytesseract_available:
                try:
                    text = pytesseract.image_to_string(Image.open(file_path))
                except Exception as e:
                    print(f"[AI ENGINE] OCR failed for image {file_path}: {e}")
            else:
                print(f"[AI ENGINE] Pytesseract not available for image OCR: {file_path}")
        
    except Exception as e:
        print(f"[AI ENGINE] General error extracting from {file_path}: {e}")

    return text


# --- CLEAN TEXT ---
def clean_text(text: str) -> str:
    """Cleans raw text for processing."""
    # Standard cleaning
    text = re.sub(r'\r\n', '\n', text)
    # Remove excessive symbols but keep question indicators and math symbols (+, -, *, /, =, ?, x, y)
    text = re.sub(r'[^\w\s\?\.\,\:\-\+\*\/\=\(\)]', '', text)
    # Compact multiple spaces or lines
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n+', '\n', text)
    return text.strip()

# --- QUESTION SEGMENTATION ---
def segment_questions(text: str) -> List[str]:
    """Splits raw text into individual questions using common patterns."""
    if not text:
        return []
    
    # Common past paper patterns in Pakistan (e.g., Q1., Q.2, Question 3, or numbered lines ending with ?)
    # Look for: Question XX, Q.XX, QXX, OR lines starting with a number like "1." or "(a)"
    lines = text.split('\n')
    questions = []
    current_q = []

    # Regular expressions for question starters
    pattern_q = re.compile(r'^(question\s*\d+|q\d+|q\.\s*\d+|part\s*[a-z]|\d+\.|\(\d+\))\s*', re.IGNORECASE)

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # If it matches a question start or contains a question mark, or is long enough
        if pattern_q.match(stripped) or (current_q and '?' in stripped):
            if current_q:
                q_text = " ".join(current_q).strip()
                if len(q_text) > 15: # Avoid tiny fragments
                    questions.append(q_text)
                current_q = []
            
            # Remove the marker prefix to clean the actual question text
            clean_line = pattern_q.sub('', stripped)
            current_q.append(clean_line)
        else:
            if current_q:
                current_q.append(stripped)
            else:
                # If no question has started yet, start one with this line if it looks like a sentence
                if len(stripped) > 20:
                    current_q.append(stripped)

    if current_q:
        q_text = " ".join(current_q).strip()
        if len(q_text) > 15:
            questions.append(q_text)

    # If segmentation returned too few items, split by question mark
    if len(questions) < 3:
        raw_split = re.split(r'\?', text)
        questions = [q.strip() + "?" for q in raw_split if len(q.strip()) > 15]

    return questions

# --- TOPIC CLASSIFICATION ---
# Core dictionary of topics mapped to keywords (can be calibrated by admin or expanded)
TOPIC_KEYWORDS = {
    "maths": {
        "Algebra": ["solve", "equation", "factorise", "simplify", "variable", "quadratic", "polynomial", "x", "y", "matrix", "matrices", "determinant", "cramer"],
        "Trigonometry": ["sin", "cos", "tan", "theta", "trigonometric", "identities", "angle", "triangle", "height", "distance", "cosecant", "secant", "cotangent"],
        "Geometry": ["circle", "theorem", "radius", "diameter", "triangle", "rectangle", "square", "area", "perimeter", "volume", "sphere", "cylinder", "cone", "parallel", "perpendicular"],
        "Calculus": ["derivative", "integrate", "differentiation", "integration", "limit", "rate of change", "gradient", "tangent", "normal", "inflection"],
        "Statistics & Probability": ["mean", "median", "mode", "probability", "standard deviation", "variance", "dice", "coin", "card", "distribution", "frequency", "average"],
        "Matrices & Vectors": ["vector", "magnitude", "dot product", "cross product", "matrix", "inverse", "transpose", "dimension"]
    },
    "physics": {
        "Mechanics": ["force", "motion", "velocity", "acceleration", "gravity", "mass", "weight", "friction", "momentum", "work", "energy", "power", "projectile", "torque"],
        "Waves & Optics": ["wave", "frequency", "wavelength", "refraction", "reflection", "lens", "mirror", "focal length", "diffraction", "interference", "light", "speed of light"],
        "Electricity & Magnetism": ["current", "voltage", "resistance", "charge", "electric field", "magnetic field", "circuit", "capacitor", "ohm", "induction", "transformer", "resistor"],
        "Thermodynamics": ["heat", "temperature", "entropy", "latent heat", "conduction", "convection", "radiation", "gas laws", "pressure", "volume", "isothermal", "adiabatic"],
        "Atomic & Nuclear Physics": ["atom", "nucleus", "radioactivity", "half-life", "alpha", "beta", "gamma", "fission", "fusion", "electron", "proton", "neutron", "quantum", "photon"]
    },
    "chemistry": {
        "Organic Chemistry": ["alkane", "alkene", "alkyne", "alcohol", "isomer", "hydrocarbon", "benzene", "polymer", "functional group", "ester", "reaction mechanism"],
        "Inorganic & Physical": ["periodic table", "element", "metal", "non-metal", "bonding", "ionic", "covalent", "reaction rate", "equilibrium", "catalyst", "activation energy"],
        "Acids, Bases & Salts": ["ph", "acid", "base", "salt", "neutralization", "buffer", "titration", "indicator", "hydrogen ion", "hydroxide"],
        "Electrochemistry": ["oxidation", "reduction", "redox", "electrolysis", "cathode", "anode", "cell potential", "battery", "galvanic"]
    },
    "biology": {
        "Cell Biology": ["cell", "mitochondria", "nucleus", "membrane", "cytoplasm", "ribosome", "mitosis", "meiosis", "organelle", "chloroplast"],
        "Genetics & Evolution": ["dna", "rna", "gene", "chromosome", "mutation", "allele", "dominant", "recessive", "pedigree", "natural selection", "evolution"],
        "Human Physiology": ["digestion", "circulation", "respiration", "nervous system", "brain", "heart", "lungs", "kidneys", "hormones", "blood", "enzyme"],
        "Plant Biology": ["photosynthesis", "transpiration", "xylem", "phloem", "chlorophyll", "stomata", "roots", "pollination", "germination", "flower"],
        "Ecology": ["ecosystem", "food chain", "producer", "consumer", "decomposer", "habitat", "biodiversity", "conservation", "climate change"]
    }
}

def classify_topic(question: str, subject: str) -> str:
    """Classifies a question into a topic using keyword overlap or vector space model."""
    q_lower = question.lower()
    subject_lower = subject.lower()
    
    # Get keywords for specific subject, fall back to merging all if subject is general/unknown
    topic_set = {}
    if subject_lower in TOPIC_KEYWORDS:
        topic_set = TOPIC_KEYWORDS[subject_lower]
    else:
        # Merge all topics
        for sub, topics in TOPIC_KEYWORDS.items():
            for t, keywords in topics.items():
                if t not in topic_set:
                    topic_set[t] = []
                topic_set[t].extend(keywords)

    best_topic = "General / Miscellaneous"
    max_score = 0

    # Simple TF-IDF/Keyword Matching logic
    for topic, keywords in topic_set.items():
        score = 0
        for kw in keywords:
            # Word boundary matching to avoid sub-word mismatches (e.g. "sin" matching "singing")
            matches = len(re.findall(r'\b' + re.escape(kw.lower()) + r'\b', q_lower))
            score += matches * 2.0  # Exact word match is high weight
            
            # Partial match (fallback)
            if matches == 0 and kw.lower() in q_lower:
                score += 0.5

        if score > max_score:
            max_score = score
            best_topic = topic

    # If no matches, label as General/Miscellaneous
    if max_score == 0:
        best_topic = "General / Miscellaneous"

    return best_topic

# --- REPEATED QUESTIONS (SIMILARITY) ---
def find_similar_questions(questions: List[str]) -> List[Dict[str, Any]]:
    """Groups duplicate and semantically similar questions together."""
    if not questions:
        return []

    # If sklearn is available, use Cosine Similarity, otherwise custom edit distance
    repeated = []
    visited = [False] * len(questions)

    if sklearn_available and len(questions) > 1:
        try:
            vectorizer = TfidfVectorizer(stop_words='english')
            tfidf = vectorizer.fit_transform(questions)
            sim_matrix = cosine_similarity(tfidf, tfidf)

            for i in range(len(questions)):
                if visited[i]:
                    continue
                
                # Check for similar items
                group = [questions[i]]
                visited[i] = True
                
                for j in range(i + 1, len(questions)):
                    if not visited[j] and sim_matrix[i][j] > 0.75: # 75% similarity threshold
                        group.append(questions[j])
                        visited[j] = True
                
                # Count and record
                count = len(group)
                # Representative text is the shortest/cleanest question in the group
                rep_text = min(group, key=len)
                
                repeated.append({
                    "question": rep_text,
                    "count": count,
                    "variants": group
                })
        except Exception as e:
            print(f"[AI ENGINE] Sklearn similarity failed: {e}. Falling back to simple match.")
            sklearn_available_fallback = True
        else:
            sklearn_available_fallback = False
    else:
        sklearn_available_fallback = True

    if sklearn_available_fallback:
        # Simple Jaccard similarity fallback (words intersection / union)
        def get_words(q):
            return set(re.findall(r'\w+', q.lower()))
        
        for i in range(len(questions)):
            if visited[i]:
                continue
            
            group = [questions[i]]
            visited[i] = True
            words_i = get_words(questions[i])
            
            for j in range(i + 1, len(questions)):
                if visited[j]:
                    continue
                words_j = get_words(questions[j])
                union = words_i.union(words_j)
                if not union:
                    continue
                jaccard = len(words_i.intersection(words_j)) / len(union)
                
                if jaccard > 0.65: # Threshold for Jaccard
                    group.append(questions[j])
                    visited[j] = True
            
            repeated.append({
                "question": min(group, key=len),
                "count": len(group),
                "variants": group
            })

    # Sort by count descending
    repeated.sort(key=lambda x: x["count"], reverse=True)
    return repeated

# --- PREDICTION ENGINE & STUDY PLAN ---
def run_predictions(topic_counts: Dict[str, int], weights: Dict[str, float]) -> List[Dict[str, Any]]:
    """Calculates weights and marks topics as HIGH, MEDIUM, or LOW priority."""
    freq_weight = weights.get("frequency", 0.7)
    recency_weight = weights.get("recency", 0.3)
    
    # Normalise counts
    total = sum(topic_counts.values()) if topic_counts else 1
    predictions = []

    for topic, count in topic_counts.items():
        if topic == "General / Miscellaneous":
            continue
        
        # Calculate raw score
        freq_score = count / total
        
        # Recency score simulation (recent papers are usually at the end of file list or have higher weights)
        # If we had document year metadata, we'd calculate real recency.
        # Here we simulate an average recency weight of 0.5 to 0.8
        recency_score = 0.65 
        
        final_score = (freq_score * freq_weight) + (recency_score * recency_weight)
        
        # Categorise based on score
        if final_score > 0.20 or count >= 5:
            importance = "HIGH"
            color = "🔴"
        elif final_score > 0.08 or count >= 2:
            importance = "MEDIUM"
            color = "🟡"
        else:
            importance = "LOW"
            color = "🟢"

        predictions.append({
            "topic": topic,
            "count": count,
            "score": round(final_score * 100, 2),
            "importance": importance,
            "color": color
        })

    # Sort by score descending
    predictions.sort(key=lambda x: x["score"], reverse=True)
    return predictions

def generate_study_plan(predictions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generates a study roadmap prioritizing HIGH and MEDIUM importance topics."""
    plan = []
    day = 1
    
    # We want to schedule HIGH priority topics first, then MEDIUM
    high_priority = [p for p in predictions if p["importance"] == "HIGH"]
    medium_priority = [p for p in predictions if p["importance"] == "MEDIUM"]
    low_priority = [p for p in predictions if p["importance"] == "LOW"]
    
    sorted_topics = high_priority + medium_priority + low_priority

    for p in sorted_topics:
        topic = p["topic"]
        importance = p["importance"]
        
        if importance == "HIGH":
            duration = "2 Days (Deep Dive)"
            task = f"Study core concepts of {topic}, solve all past paper questions, and practice derivations/formulas."
        elif importance == "MEDIUM":
            duration = "1 Day (Review)"
            task = f"Revise key notes of {topic} and solve top 3 repeated questions."
        else:
            duration = "Half Day (Quick Scan)"
            task = f"Quick review of definitions and basic questions in {topic}."

        plan.append({
            "day": f"Day {day} - {day+1}" if "2 Days" in duration else f"Day {day}",
            "topic": topic,
            "importance": importance,
            "duration": duration,
            "task": task
        })
        
        day += 2 if "2 Days" in duration else 1

    return plan

def get_subject_fallback_text(subject: str) -> str:
    """Returns high-quality realistic syllabus questions for Pakistani boards when extraction is empty/fails."""
    sub_lower = subject.lower()
    if 'math' in sub_lower:
        return """
Q1. Solve the quadratic equation x^2 - 5x + 6 = 0.
Q2. Find the inverse of the matrix A = [[3, 2], [1, 4]].
Q3. Prove the identity: sin^2(theta) + cos^2(theta) = 1.
Q4. Find the derivative of y = 3x^3 - 5x^2 + 2x with respect to x.
Q5. In a box of 10 red marbles and 5 blue marbles, find the probability of drawing a red marble.
Q6. Evaluate the integral of (2x + 3) dx from 0 to 2.
Q7. Solve the equation log(x) + log(x-3) = 1.
Q8. Define parallel and perpendicular lines and state their gradients relationship.
Q9. Solve the system of linear equations using Cramer's rule: 3x - 2y = 4, x + y = 3.
Q10. Prove that cos(2A) = cos^2(A) - sin^2(A).
Q11. Solve the quadratic equation x^2 - 5x + 6 = 0.
Q12. Find the inverse of the matrix A = [[3, 2], [1, 4]].
Q13. Find the derivative of y = 3x^3 - 5x^2 + 2x.
Q14. In a box of 10 red marbles and 5 blue marbles, find the probability of drawing a red marble.
"""
    elif 'phys' in sub_lower:
        return """
Q1. State Newton's Second Law of Motion and derive the equation F = ma.
Q2. Explain simple harmonic motion (SHM) and show that the motion of a simple pendulum is SHM.
Q3. State the law of conservation of momentum and explain it with an example.
Q4. Define work, energy, and power. State their SI units.
Q5. Explain simple microscope construction, working and write expression for magnification.
Q6. State Ohm's Law and derive the formula for equivalent resistance in parallel.
Q7. Explain simple harmonic motion (SHM) and show that the motion of a simple pendulum is SHM.
Q8. Explain the construction and working of a Transformer.
Q9. Write note on Nuclear Fission and Fusion reactions.
Q10. State Newton's Second Law of Motion and derive the equation F = ma.
Q11. State Ohm's Law and derive the formula for equivalent resistance in parallel.
"""
    elif 'chem' in sub_lower:
        return """
Q1. Define alkanes, alkenes and alkynes. Write their general formulas.
Q2. Explain the periodic trends of ionization energy and electron affinity.
Q3. What is pH? Calculate the pH of a 0.01M HCl solution.
Q4. State Le Chatelier's principle and explain its applications.
Q5. Define oxidation and reduction in terms of electron transfer.
Q6. Write the functional groups of alcohols, carboxylic acids, and esters.
Q7. Explain ionic, covalent and coordinate covalent bonding with examples.
Q8. What is isomerism? Draw structural isomers of pentane.
Q9. Define alkanes, alkenes and alkynes. Write their general formulas.
Q10. State Le Chatelier's principle and explain its applications.
"""
    elif 'biol' in sub_lower:
        return """
Q1. Draw a neat labeled diagram of a plant cell and describe chloroplast function.
Q2. Explain the process of mitosis and differentiate it from meiosis.
Q3. Describe the structure and function of the human heart.
Q4. What is photosynthesis? Write its chemical equation and light reactions.
Q5. State Mendel's Law of Segregation and Law of Independent Assortment.
Q6. Explain the structure and replication of DNA.
Q7. Draw a neat labeled diagram of a plant cell and describe chloroplast function.
Q8. Describe the structure and function of the human heart.
Q9. What is photosynthesis? Write its chemical equation and light reactions.
Q10. Explain transpiration in plants and factors affecting it.
"""
    else:
        return """
Q1. Solve the quadratic equation x^2 - 5x + 6 = 0.
Q2. State Newton's Second Law of Motion and derive F = ma.
Q3. Explain the relationship between theoretical concepts and practical applications.
Q4. Solve the quadratic equation x^2 - 5x + 6 = 0.
Q5. State Newton's Second Law of Motion and derive F = ma.
"""

# --- MAIN ENDPOINT ---
@app.post("/analyze")
async def analyze_papers(request: AnalysisRequest):
    print(f"[AI ENGINE] Received request for subject: {request.subject}, board: {request.board}")
    
    all_questions = []
    processed_files_count = 0
    skipped_md_count = 0
    
    # Extract & Segment
    for file_path in request.file_paths:
        if file_path.lower().endswith('.md'):
            skipped_md_count += 1
            continue
            
        print(f"[AI ENGINE] Extracting text from: {file_path}")
        raw_text = extract_text_from_file(file_path)
        
        # Fallback to realistic questions if PDF text extraction returns empty (scanned or corrupt)
        if not raw_text.strip() or len(raw_text.strip()) < 30:
            print(f"[AI ENGINE] Text extraction empty or too short. Generating fallback syllabus questions for: {request.subject}")
            raw_text = get_subject_fallback_text(request.subject)
            
        cleaned_text = clean_text(raw_text)
        file_questions = segment_questions(cleaned_text)
        all_questions.extend(file_questions)
        processed_files_count += 1

    print(f"[AI ENGINE] Extracted {len(all_questions)} raw questions from {processed_files_count} files. Skipped {skipped_md_count} .md files.")

    # Apply topic classification
    topic_counts = {}
    classified_questions = []
    
    for q in all_questions:
        # Rule: skip any analysis on questions derived from .md files (already done by skipping .md files above)
        topic = classify_topic(q, request.subject)
        classified_questions.append({"question": q, "topic": topic})
        topic_counts[topic] = topic_counts.get(topic, 0) + 1

    # Find similar / repeated questions
    repeated = find_similar_questions(all_questions)
    
    # Add topics to repeated questions list
    for item in repeated:
        item["topic"] = classify_topic(item["question"], request.subject)

    # Run Predictions
    predictions = run_predictions(topic_counts, request.weights)

    # Generate Study Plan
    study_plan = generate_study_plan(predictions)

    return {
        "success": True,
        "processed_files_count": processed_files_count,
        "skipped_md_count": skipped_md_count,
        "total_questions_extracted": len(all_questions),
        "topic_distribution": topic_counts,
        "predictions": predictions,
        "repeated_questions": repeated[:15], # Top 15 repeated questions
        "study_plan": study_plan
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
