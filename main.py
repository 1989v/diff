from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
import httpx
import json
import difflib
from typing import Any, List, Dict

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 중 전체 허용, 운영시 도메인 제한 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CompareRequest(BaseModel):
    url1: HttpUrl
    url2: HttpUrl

class CompareResult(BaseModel):
    type: str  # 'json' or 'html' or 'text'
    diff: Any
    content1: str
    content2: str
    line_diffs: List[Dict[str, Any]]

async def fetch_content(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.text
        except httpx.TimeoutException:
            raise HTTPException(status_code=408, detail=f"Timeout while fetching {url}")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"HTTP error {e.response.status_code} for {url}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error fetching {url}: {str(e)}")

def try_parse_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        return None

def json_diff(a, b):
    # Simple recursive diff
    if a == b:
        return None
    if type(a) != type(b):
        return {'from': a, 'to': b}
    if isinstance(a, dict):
        keys = set(a.keys()) | set(b.keys())
        diff = {}
        for k in keys:
            d = json_diff(a.get(k), b.get(k))
            if d is not None:
                diff[k] = d
        return diff if diff else None
    if isinstance(a, list):
        length = max(len(a), len(b))
        diff = []
        for i in range(length):
            d = json_diff(a[i] if i < len(a) else None, b[i] if i < len(b) else None)
            diff.append(d)
        return diff if any(x is not None for x in diff) else None
    return {'from': a, 'to': b}

def text_diff(text1: str, text2: str):
    """Generate unified diff between two texts"""
    lines1 = text1.splitlines(keepends=True)
    lines2 = text2.splitlines(keepends=True)
    
    diff = list(difflib.unified_diff(
        lines1, lines2,
        fromfile='URL1',
        tofile='URL2',
        lineterm=''
    ))
    
    return diff

def calculate_line_diffs(text1: str, text2: str) -> List[Dict[str, Any]]:
    """Calculate line-by-line differences"""
    lines1 = text1.splitlines()
    lines2 = text2.splitlines()
    
    matcher = difflib.SequenceMatcher(None, lines1, lines2)
    line_diffs = []
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            # 같은 라인들
            for idx in range(i1, i2):
                line_diffs.append({
                    'line_number': idx + 1,
                    'type': 'equal',
                    'content': lines1[idx],
                    'highlight': False
                })
        elif tag == 'replace':
            # 교체된 라인들
            for idx in range(i1, i2):
                line_diffs.append({
                    'line_number': idx + 1,
                    'type': 'deleted',
                    'content': lines1[idx],
                    'highlight': True
                })
            for idx in range(j1, j2):
                line_diffs.append({
                    'line_number': idx + 1,
                    'type': 'added',
                    'content': lines2[idx],
                    'highlight': True
                })
        elif tag == 'delete':
            # 삭제된 라인들
            for idx in range(i1, i2):
                line_diffs.append({
                    'line_number': idx + 1,
                    'type': 'deleted',
                    'content': lines1[idx],
                    'highlight': True
                })
        elif tag == 'insert':
            # 추가된 라인들
            for idx in range(j1, j2):
                line_diffs.append({
                    'line_number': idx + 1,
                    'type': 'added',
                    'content': lines2[idx],
                    'highlight': True
                })
    
    return line_diffs

from fastapi import Request

@app.post("/compare", response_model=CompareResult)
async def compare(request: Request):
    data = await request.json()

    # 텍스트 직접 비교 모드
    if "raw1" in data and "raw2" in data:
        text1 = data["raw1"]
        text2 = data["raw2"]
    else:
        try:
            text1 = await fetch_content(str(data["url1"]))
            text2 = await fetch_content(str(data["url2"]))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error fetching URLs: {e}")

    json1 = try_parse_json(text1)
    json2 = try_parse_json(text2)

    def deep_parse_json_strings(obj, sort_array_keys=None):
        if sort_array_keys is None:
            sort_array_keys = {"ranges"}  # 필요시 확장
        if isinstance(obj, str):
            try:
                if (obj.startswith("{") and obj.endswith("}")) or (obj.startswith("[") and obj.endswith("]")):
                    parsed = json.loads(obj)
                    return deep_parse_json_strings(parsed, sort_array_keys)
            except Exception:
                return obj
            return obj
        elif isinstance(obj, list):
            return [deep_parse_json_strings(item, sort_array_keys) for item in obj]
        elif isinstance(obj, dict):
            out = {}
            for k in sorted(obj.keys()):
                v = obj[k]
                # 배열 정렬이 필요한 key라면 내부 dict 기준 정렬
                if k in sort_array_keys and isinstance(v, list):
                    def sort_fn(x):
                        if isinstance(x, dict):
                            return (
                                x.get("key", ""),
                                x.get("from", ""),
                                x.get("to", "")
                            )
                        return str(x)
                    sorted_list = sorted(v, key=sort_fn)
                    out[k] = [deep_parse_json_strings(item, sort_array_keys) for item in sorted_list]
                else:
                    out[k] = deep_parse_json_strings(v, sort_array_keys)
            return out
        return obj

    if json1 is not None and json2 is not None:
        parsed1 = deep_parse_json_strings(json1)
        parsed2 = deep_parse_json_strings(json2)
        diff = json_diff(parsed1, parsed2)
        pretty1 = json.dumps(parsed1, indent=2, ensure_ascii=False, sort_keys=True)
        pretty2 = json.dumps(parsed2, indent=2, ensure_ascii=False, sort_keys=True)
        line_diffs = calculate_line_diffs(pretty1, pretty2)
        return {
            "type": "json", 
            "diff": diff,
            "content1": pretty1,
            "content2": pretty2,
            "line_diffs": line_diffs
        }

    # Otherwise, treat as text/html
    diff = text_diff(text1, text2)
    line_diffs = calculate_line_diffs(text1, text2)
    return {
        "type": "text", 
        "diff": diff,
        "content1": text1,
        "content2": text2,
        "line_diffs": line_diffs
    }
