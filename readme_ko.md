# CarMediaHub SDK

CarMediaHub SDK는 플러그인 매니페스트, 수명 주기 계약, 플랫폼 컨텍스트, capability API와 격리된 데이터 접근 규칙을 정의합니다.

언어: [English](readme.md) · [简体中文](readme_zh.md) · 한국어

플러그인은 Core 내부 모듈을 가져오지 않고 공개 계약을 통해 플랫폼 기능을 사용합니다.

## 초안 계약

검토 단계의 v0 계약은 [`spec/v0`](spec/v0/readme_ko.md)에 있습니다. 실행 중인 Core 없이도 매니페스트 검증과 안정적인 오류 식별자를 정의합니다.
