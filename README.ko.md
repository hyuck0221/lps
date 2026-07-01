# LPS - Local Process

LPS는 macOS용 로컬 프로세스 모니터입니다. localhost에서 열리는 다크 GUI로 현재 실행 중인 프로세스를 실시간으로 확인하고, 로컬 서버 링크를 열고, 부팅 후 실행할 명령어를 관리하고, 필요한 경우 선택한 프로세스를 종료할 수 있습니다.

설치, 설정, 실행은 모두 `lps` CLI로 진행합니다.

## 설치 방법

```sh
curl -fsSL https://github.com/OWNER/REPO/releases/latest/download/install.sh | bash
```

## 초기 세팅

실행:

```sh
lps
```

처음 실행하면 터미널에서 단계별 초기 설정이 열립니다.

조작 방법:

- 위/아래 방향키로 이동
- 왼쪽/오른쪽 방향키로 언어 변경
- Enter로 옵션 변경 또는 저장
- `b`로 이전 단계 이동
- Escape 또는 `q`로 종료

설정할 수 있는 항목:

- 언어
- LPS 시작 시 GUI 자동 열기
- macOS 로그인 시 LPS 자동 시작
- 자동 업데이트 확인
- AI CLI 상태 표시

GUI의 부팅 명령어 관리 기능은 자동 시작이 켜져 있어야 사용할 수 있습니다.

## GUI 사용 방법

GUI 열기:

```sh
lps open
```

기본 주소:

```text
http://127.0.0.1:3737
```

Nginx로 `http://localhost`에서 바로 GUI를 열고 싶다면:

```sh
lps nginx on
```

GUI에서 할 수 있는 일:

- CPU, Memory, 프로세스 수, 갱신 시간 실시간 확인
- 전체 프로세스 목록 확인
- `http://127.0.0.1:3000` 같은 로컬 서버 링크 열기
- 컬럼 헤더 클릭으로 프로세스 정렬
- 자동 새로고침 일시정지/재개
- 위/아래 방향키로 선택 후 Enter로 종료
- 현재 버전 확인 및 업데이트 설치

## 명령어

```sh
lps                 # 필요하면 초기 설정 후 GUI 시작
lps start           # GUI 서버를 백그라운드로 시작
lps serve           # GUI 서버를 포그라운드에서 실행
lps stop            # 백그라운드 서버 중지
lps restart         # 백그라운드 서버 재시작
lps open            # 브라우저에서 GUI 열기
lps status          # 현재 상태 확인
lps setting         # 설정 UI 열기
lps version         # 현재 버전 출력
lps update check    # 최신 GitHub Release 확인
lps update          # 최신 릴리스 설치 후 재시작
lps startup list    # 부팅 명령어와 최근 결과 확인
lps startup add "Name" "command" [priority] [cwd]
lps startup edit <id> name=... command=... priority=... cwd=... enabled=true
lps startup enable <id>
lps startup disable <id>
lps startup delete <id>
lps nginx on        # http://localhost를 GUI로 프록시
lps nginx off       # localhost 프록시 제거
lps nginx status    # localhost 프록시 상태 확인
lps autostart on    # macOS 로그인 자동 시작 켜기
lps autostart off   # macOS 로그인 자동 시작 끄기
```
