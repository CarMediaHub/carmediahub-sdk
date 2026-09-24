# SDK v0 초안 계약

이 디렉터리에는 CarMediaHub SDK의 검토 단계 공개 계약이 있습니다.

- `manifest.schema.json`: 현재 TypeScript `PluginManifest` 검증기와 일치하는 기계 판독용 계약입니다. 패키지 도구는 이 스키마와 SDK 런타임 검증기를 함께 사용해야 합니다.
- `errors.json`: v0에서 사용할 안정적인 오류 코드 목록
- `jobs` capability는 현재 사용자와 플러그인 설치 인스턴스 범위로 제한됩니다. 초기 한도는 범위마다 활성 작업 10개이며 JSON payload와 결과는 각각 64 KiB입니다. 큐 또는 크기 초과는 안정적인 `CMH.JOBS.QUEUE_FULL`, `CMH.JOBS.PAYLOAD_TOO_LARGE`, `CMH.JOBS.RESULT_TOO_LARGE` 항목을 사용하며, 중단된 작업과 핸들러 실패는 각각 `CMH.JOBS.INTERRUPTED`와 `CMH.JOBS.EXECUTION_FAILED`를 사용합니다.
- `history` capability는 범위가 제한된 `record`, `query`, `clear` 작업을 제공합니다. 플러그인은 주제와 표시 메타데이터를 제출하고, Core가 사용자 격리, 보존 기간, 필터링과 삭제를 관리합니다.
- `catalog` capability는 검색 가능한 플러그인 항목을 위한 범위 제한 `register`, `query`, `remove`를 제공합니다. Core가 색인과 권한 경계를 관리하며 플러그인은 메타데이터만 제출하고 SQL이나 다른 범위를 조회할 수 없습니다.
- `display` capability는 읽기 전용 표시 기능과 `requestMode` 의도를 제공합니다. Core가 전체 화면 지원 여부를 보고하고 요청을 거부할 수 있으며 플러그인은 창이나 브라우저를 제어할 수 없습니다.

이 자료는 초안이며 Core 내부 구현, 호스트 경로, 자격 증명, 네트워크 토폴로지 또는 비공개 통합을 포함하지 않습니다.
