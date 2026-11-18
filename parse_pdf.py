import PyPDF2

try:
    with open('test_download.pdf', 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        text = ''
        for page in reader.pages:
            text += page.extract_text()
        print("PDF Extracted Text:")
        print(text)
except Exception as e:
    print("Error:", e)
