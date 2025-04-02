# TwelveLabs MCP 서버

TwelveLabs API를 활용한 Model Context Protocol(MCP) 서버입니다.

## 기능

- 인덱스 생성 및 관리
- 비디오 업로드 및 분석
- 텍스트 기반 비디오 검색
- 비디오로부터 텍스트 생성 (트랜스크립트, 요약 등)

## 사전 요구사항

- TwelveLabs API 키
- Docker 및 Docker Compose (선택사항, 컨테이너화된 실행을 위해)
- Node.js (로컬 실행 시)

## 로컬에서 실행하기

1. 필요한 환경 변수 설정:

```bash
export TWELVELABS_API_KEY="your_api_key_here"
```

2. 종속성 설치:

```bash
npm install
```

3. 서버 실행:

```bash
npm start
```

## Docker를 사용하여 실행하기

### 방법 1: Docker Compose 사용

1. 필요한 폴더 생성:

```bash
mkdir -p data
```

2. 환경 변수 설정:

```bash
export TWELVELABS_API_KEY="your_api_key_here"
```

3. Docker Compose로 실행:

```bash
docker-compose up -d
```

### 방법 2: Docker 명령어 직접 사용

```bash
docker build -t twelvelabs-mcp .
docker run -e TWELVELABS_API_KEY="your_api_key_here" twelvelabs-mcp
```

## Portainer에서 실행 시 주의사항

Portainer에서 볼륨 문제가 발생할 경우, 다음과 같이 수동으로 볼륨을 생성하고 서비스에 연결해 보세요:

1. 볼륨 생성:

```bash
docker volume create \
  --driver local \
  --opt type=none \
  --opt device=/path/to/host/directory \
  --opt o=bind \
  twelvelabs-mcp-data
```

2. 서비스 업데이트 (N8N 환경에서):

```bash
docker service update \
  --mount-add type=volume,source=twelvelabs-mcp-data,target=/app/data \
  your_service_name
```

## 트러블슈팅

### 모듈을 찾을 수 없는 오류

이 오류는 보통 볼륨 마운트가 올바르게 설정되지 않았을 때 발생합니다. 위의 "Portainer에서 실행 시 주의사항"을 참고하세요.

### API 키 인증 오류

환경 변수 `TWELVELABS_API_KEY`가 올바르게 설정되었는지 확인하세요.

## 라이선스

MIT
