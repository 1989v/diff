# Web Compare API

두 개의 웹 페이지(URL)를 입력받아, 컨텐츠를 비교해주는 FastAPI 기반 API입니다.

## 설치 및 실행 (uv 활용)

[uv](https://github.com/astral-sh/uv)는 빠른 Python 패키지 매니저입니다. 아래와 같이 설치 및 서버 실행을 할 수 있습니다.

```bash
# 패키지 설치 (pip 대신 uv 사용)
uv pip install -r requirements.txt

# FastAPI 서버 실행 (여전히 uvicorn 사용)
uvicorn main:app --reload
```

- `uv`가 없다면: `pip install uv` 또는 [공식 가이드](https://github.com/astral-sh/uv#installation) 참고
- 프론트엔드 개발 서버는 `frontend` 폴더에서 별도로 실행합니다.


## 사용법

### 엔드포인트
- `POST /compare`

### 요청 예시
```json
{
  "url1": "https://example.com/data1.json",
  "url2": "https://example.com/data2.json"
}
```

### 응답 예시 (json 데이터 비교)
```json
{
  "type": "json",
  "diff": {
    "key": {"from": 1, "to": 2}
  }
}
```

### 응답 예시 (html/text 비교)
```json
{
  "type": "text",
  "diff": [[0, "공통부분"], [-1, "삭제된부분"], [1, "추가된부분"]]
}
```

- diff의 포맷은 [diff-match-patch](https://github.com/google/diff-match-patch) 라이브러리의 결과 포맷을 따릅니다.
