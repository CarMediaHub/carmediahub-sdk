# SDK v0 초안 계약

이 디렉터리에는 CarMediaHub SDK의 검토 단계 공개 계약이 있습니다.

- `manifest.schema.json`: v0 플러그인 패키지 매니페스트 구조
- `errors.json`: v0에서 사용할 안정적인 오류 코드 목록
- `jobs` capability는 현재 사용자와 플러그인 설치 인스턴스 범위로 제한됩니다. 초기 한도는 범위마다 활성 작업 10개이며 JSON payload와 결과는 각각 64 KiB입니다. 큐 또는 크기 초과는 안정적인 `CMH.JOBS.QUEUE_FULL`, `CMH.JOBS.PAYLOAD_TOO_LARGE`, `CMH.JOBS.RESULT_TOO_LARGE` 항목을 사용합니다.

이 자료는 초안이며 Core 내부 구현, 호스트 경로, 자격 증명, 네트워크 토폴로지 또는 비공개 통합을 포함하지 않습니다.
