import { useState, useEffect, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import styles from "./App.module.css";

const API_URL = "http://localhost:8000/compare";

function deepParseJsonStrings(obj: any): any {
  if (typeof obj === "string") {
    // 완전한 JSON 오브젝트/배열 string이면 파싱해서 object로 대체
    if ((obj.startsWith("{") && obj.endsWith("}")) || (obj.startsWith("[") && obj.endsWith("]"))) {
      try {
        const parsed = JSON.parse(obj);
        return deepParseJsonStrings(parsed);
      } catch {
        return obj;
      }
    }
    return obj;
  } else if (Array.isArray(obj)) {
    return obj.map(deepParseJsonStrings);
  } else if (typeof obj === "object" && obj !== null) {
    const out: any = {};
    for (const key in obj) {
      out[key] = deepParseJsonStrings(obj[key]);
    }
    return out;
  }
  return obj;
}

function safeUnescape(str: any) {
  if (typeof str === "string" && ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]")))) {
    try {
      const obj = JSON.parse(str);
      const parsedObj = deepParseJsonStrings(obj);
      return JSON.stringify(parsedObj, null, 2);
    } catch {}
  }
  if (typeof str === "string" && str.length > 1 && str.startsWith('"') && str.endsWith('"')) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === "object") {
        const parsedObj = deepParseJsonStrings(parsed);
        return JSON.stringify(parsedObj, null, 2);
      }
      if (typeof parsed === "string") {
        if ((parsed.startsWith("{") && parsed.endsWith("}")) || (parsed.startsWith("[") && parsed.endsWith("]"))) {
          try {
            const deepParsed = JSON.parse(parsed);
            if (typeof deepParsed === "object") {
              const parsedObj = deepParseJsonStrings(deepParsed);
              return JSON.stringify(parsedObj, null, 2);
            }
          } catch {}
        }
        return parsed;
      }
    } catch {}
  }
  if (str === undefined || str === null) return "";
  return String(str);
}



function App() {
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [content1, setContent1] = useState("");
  const [content2, setContent2] = useState("");
  const [lineDiffs, setLineDiffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const editor1Ref = useRef<any>(null);
  const editor2Ref = useRef<any>(null);
  const [decorations1, setDecorations1] = useState<string[]>([]);
  const [decorations2, setDecorations2] = useState<string[]>([]);

  const fetchAndCompare = async () => {
    setLoading(true);
    setError("");
    setContent1("");
    setContent2("");
    setLineDiffs([]);
    setShowDiff(false);
    
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url1, url2 }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      
      const data = await res.json();
      
      // 서버에서 받은 원본 컨텐츠 사용
      setContent1(data.content1 || "");
      setContent2(data.content2 || "");
      setLineDiffs(data.line_diffs || []);
      setShowDiff(true);
      
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 차이점 하이라이트 및 스크롤 동기화
  useEffect(() => {
    if (editor1Ref.current && editor2Ref.current && lineDiffs.length > 0) {
      const editor1 = editor1Ref.current;
      const editor2 = editor2Ref.current;

      // 스크롤 동기화 함수들
      let isScrolling1 = false;
      let isScrolling2 = false;

      // 더 정밀한 스크롤 싱크 (픽셀 단위)
      const syncScroll1To2 = () => {
        if (!isScrolling2) {
          isScrolling1 = true;
          const top = editor1.getScrollTop();
          const left = editor1.getScrollLeft();
          editor2.setScrollTop(top);
          editor2.setScrollLeft(left);
          requestAnimationFrame(() => { isScrolling1 = false; });
        }
      };
      const syncScroll2To1 = () => {
        if (!isScrolling1) {
          isScrolling2 = true;
          const top = editor2.getScrollTop();
          const left = editor2.getScrollLeft();
          editor1.setScrollTop(top);
          editor1.setScrollLeft(left);
          requestAnimationFrame(() => { isScrolling2 = false; });
        }
      };


      // 스크롤 이벤트 리스너 등록
      const d1 = editor1.onDidScrollChange(syncScroll1To2);
      const d2 = editor2.onDidScrollChange(syncScroll2To1);

      // 차이점 하이라이트 설정
      const decorationsArr1: any[] = [];
      const decorationsArr2: any[] = [];
      const lines1 = content1.split('\n');
      const lines2 = content2.split('\n');
      let lineIndex1 = 0;
      let lineIndex2 = 0;
      lineDiffs.forEach((diff) => {
        if (diff.type === 'deleted') {
          if (lineIndex1 < lines1.length) {
            decorationsArr1.push({
              range: {
                startLineNumber: lineIndex1 + 1,
                startColumn: 1,
                endLineNumber: lineIndex1 + 1,
                endColumn: lines1[lineIndex1].length + 1
              },
              options: {
                backgroundColor: '#ffebee',
                borderColor: '#f44336',
                borderWidth: '2px',
                borderStyle: 'solid',
                isWholeLine: true,
                linesDecorationsClassName: styles.lineDeleted,
                className: styles.lineDeletedBg
              }
            });
            lineIndex1++;
          }
        } else if (diff.type === 'added') {
          if (lineIndex2 < lines2.length) {
            decorationsArr2.push({
              range: {
                startLineNumber: lineIndex2 + 1,
                startColumn: 1,
                endLineNumber: lineIndex2 + 1,
                endColumn: lines2[lineIndex2].length + 1
              },
              options: {
                backgroundColor: '#e8f5e8',
                borderColor: '#4caf50',
                borderWidth: '2px',
                borderStyle: 'solid',
                isWholeLine: true,
                linesDecorationsClassName: styles.lineModified,
                className: styles.lineModifiedBg
              }
            });
            lineIndex2++;
          }
        } else if (diff.type === 'equal') {
          if (lineIndex1 < lines1.length && lineIndex2 < lines2.length) {
            decorationsArr1.push({
              range: {
                startLineNumber: lineIndex1 + 1,
                startColumn: 1,
                endLineNumber: lineIndex1 + 1,
                endColumn: lines1[lineIndex1].length + 1
              },
              options: {
                backgroundColor: '#f8f9fa',
                borderColor: '#6c757d',
                borderWidth: '1px',
                borderStyle: 'dashed',
                isWholeLine: true
              }
            });
            decorationsArr2.push({
              range: {
                startLineNumber: lineIndex2 + 1,
                startColumn: 1,
                endLineNumber: lineIndex2 + 1,
                endColumn: lines2[lineIndex2].length + 1
              },
              options: {
                backgroundColor: '#f8f9fa',
                borderColor: '#6c757d',
                borderWidth: '1px',
                borderStyle: 'dashed',
                isWholeLine: true
              }
            });
            lineIndex1++;
            lineIndex2++;
          }
        }
      });
      // 데코레이션 적용 및 ID 저장
      setDecorations1(editor1.deltaDecorations(decorations1, decorationsArr1));
      setDecorations2(editor2.deltaDecorations(decorations2, decorationsArr2));
      // cleanup
      return () => {
        d1.dispose();
        d2.dispose();
      };
    }
  }, [showDiff, lineDiffs, content1, content2]);

  return (
    <div className={styles.container}>
      <div className={styles["url-bar"]}>
        <input
          className={styles["url-input"]}
          type="text"
          placeholder="첫 번째 URL 입력"
          value={url1}
          onChange={(e) => setUrl1(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && url1 && url2 && !loading) fetchAndCompare();
          }}
        />
        <input
          className={styles["url-input"]}
          type="text"
          placeholder="두 번째 URL 입력"
          value={url2}
          onChange={(e) => setUrl2(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && url1 && url2 && !loading) fetchAndCompare();
          }}
        />
        <button className={styles["compare-btn"]} onClick={fetchAndCompare} disabled={loading || !url1 || !url2}>
          {loading ? "비교 중..." : "비교"}
        </button>
      </div>
      {error && (
        <div style={{ color: "#ff6161", padding: "0.5rem 1rem", backgroundColor: "#ffebee", borderRadius: "4px", margin: "0.5rem 0" }}>
          {error}
        </div>
      )}
           <div className={styles.split}>
        <div className={styles.editor}>
          <div className={styles["editor-title"]}>
            {showDiff ? "URL 1 (원본)" : "URL 1 결과"}
          </div>
          <MonacoEditor
            height="100%"
            language="json"
            value={safeUnescape(content1)}
            onMount={(editor, monaco) => {
              editor1Ref.current = editor;
              editor.onMouseDown((e) => {
                if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
                  const line = e.target.position.lineNumber;
                  const text = editor.getModel()?.getLineContent(line) || '';
                  navigator.clipboard.writeText(text);
                }
              });
            }}
            options={{
              readOnly: true,
              fontSize: 15,
              minimap: { enabled: false },
              lineNumbers: "on",
              cursorStyle: "line",
              theme: "vs-dark",
              scrollBeyondLastLine: true,
              wordWrap: "on",
              renderLineHighlight: "all",
              renderWhitespace: "selection",
              automaticLayout: true,
              stickyScroll: { enabled: false },
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 14,
                horizontalScrollbarSize: 14
              }
            }}
          />
        </div>
        <div className={styles.editor}>
          <div className={styles["editor-title"]}>
            {showDiff ? "URL 2 (수정됨)" : "URL 2 결과"}
          </div>
          <MonacoEditor
            height="100%"
            language="json"
            value={safeUnescape(content2)}
            onMount={(editor, monaco) => {
              editor2Ref.current = editor;
              editor.onMouseDown((e) => {
                if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
                  const line = e.target.position.lineNumber;
                  const text = editor.getModel()?.getLineContent(line) || '';
                  navigator.clipboard.writeText(text);
                }
              });
            }}
            options={{
              readOnly: true,
              fontSize: 15,
              minimap: { enabled: false },
              lineNumbers: "on",
              cursorStyle: "line",
              theme: "vs-dark",
              scrollBeyondLastLine: true,
              wordWrap: "on",
              renderLineHighlight: "all",
              renderWhitespace: "selection",
              automaticLayout: true,
              stickyScroll: { enabled: false },
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 14,
                horizontalScrollbarSize: 14
              }
            }}
          />
        </div>
      </div>
      {/* diff 통계 summary는 split 아래에 위치 */}
      {showDiff && lineDiffs.length > 0 && (
        <div className={styles["diff-summary"]}>
          <div className={styles["diff-stats"]}>
            <span className={styles["stat-item"]}>
              <span className={styles["stat-label"]}>삭제된 라인:</span>
              <span className={styles["stat-value"]} style={{ color: '#f44336' }}>
                {lineDiffs.filter(d => d.type === 'deleted').length}
              </span>
            </span>
            <span className={styles["stat-item"]}>
              <span className={styles["stat-label"]}>추가된 라인:</span>
              <span className={styles["stat-value"]} style={{ color: '#4caf50' }}>
                {lineDiffs.filter(d => d.type === 'added').length}
              </span>
            </span>
            <span className={styles["stat-item"]}>
              <span className={styles["stat-label"]}>총 라인:</span>
              <span className={styles["stat-value"]}>
                {lineDiffs.length}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
