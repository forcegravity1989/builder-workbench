# welink-cli 使用帮助

> 给要调用本机 WeLink 命令行的人。正文是 2026-11-18 在本机执行 `welink-cli` 1.0.18 的 `--help` 原文。命令变化时按同一版本再录一遍。

程序自述：WeLink CLI — authentication management and IM messaging。

## 顶层

```text
Usage: welink-cli [OPTIONS] [SUBCOMMAND]

Options:
  -h,--help                   Print this help message and exit
  --version                   Display program version information and exit
  -v,--verbose                Enable verbose output
  -d,--debug                  Enable debug output (implies --verbose)

Subcommands:
  config                      Manage CLI configuration
  auth                        Authentication management (OAuth2.0 + WebSocket)
  im                          Instant messaging operations
  meeting                     meeting-cli
  search                      Search for persons and search for groups
  onebox                      Onebox (Cloud Drive) file operations
  openplatform                Open platform operations
  version                     Check whether the CLI version has expired.
  mail                        Mail operations
  calendar                    Calendar operations
  contact                     Contact operations
```

本机 `welink-cli --version` 输出 `1.0.18`。下面只录 `meeting`。其余子命令用 `welink-cli <子命令> --help`。

## meeting

```text
meeting-cli
Usage: welink-cli meeting [OPTIONS] SUBCOMMAND

Options:
  -h,--help                   Print this help message and exit

Subcommands:
  topic                       Querying topic information based on meeting ID.
  topic-materials             Querying topic material information of a topic based on meeting ID and topic ID.
  info                        Querying meeting details based on meeting ID.
  list                        Obtaining Personal Meeting List of a User.
  fuzzy-search                Fuzzy search for meeting/minutes/topic information.
  cancel                      Cancel a meeting.
  create                      Create a new meeting.
  update                      Update a meeting.
  query-list                  Query meeting list.
  topic-create                Create a new topic.
  topic-delete                Delete a topic.
  topic-update                Update a topic.
```

### topic

```text
Querying topic information based on meeting ID.
Usage: welink-cli meeting topic [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID (e.g., 184421551)
```

### topic-materials

```text
Querying topic material information of a topic based on meeting ID and topic ID.
Usage: welink-cli meeting topic-materials [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID (e.g., 184421551)
  --topic-id INT:NUMBER REQUIRED
                              Topic ID (e.g., 99334655)
```

### info

```text
Querying meeting details based on meeting ID.
Usage: welink-cli meeting info [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID (e.g., 184421551)
```

### list

```text
Obtaining Personal Meeting List of a User.
Usage: welink-cli meeting list [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --offset INT:NUMBER         Offset for pagination (default: 0)
  --limit INT:NUMBER          Limit for pagination (default: 100)
```

### fuzzy-search

```text
Fuzzy search for meeting/minutes/topic information.
Usage: welink-cli meeting fuzzy-search [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --limit INT:NUMBER REQUIRED Limit for pagination (default: 10)
  --offset INT:NUMBER REQUIRED
                              Offset for pagination (default: 0)
  --result-type TEXT REQUIRED Result type
  --with-full-content         Return meeting summary full content
  --search-type TEXT ... REQUIRED
                              Search type (e.g., subject, topic, fileName, startTime, endTime, meetingMember). Support multiple values.
  --search-content TEXT ... REQUIRED
                              Search content corresponding to search-type. Support multiple values.
```

### cancel

```text
Cancel a meeting.
Usage: welink-cli meeting cancel [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID(e.g., 202674731)
```

### create

```text
Create a new meeting.
Usage: welink-cli meeting create [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --subject TEXT REQUIRED     Meeting subject
  --start-time INT:NUMBER REQUIRED
                              Meeting start time (Unix timestamp in milliseconds)
  --end-time INT:NUMBER REQUIRED
                              Meeting end time (Unix timestamp in milliseconds)
  --meeting-user-list TEXT ... REQUIRED
                              Meeting user list (W3 IDs, can be multiple)
```

### update

```text
Update a meeting.
Usage: welink-cli meeting update [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID(e.g., 202674731)
  --subject TEXT              Meeting subject
  --start-time INT:NUMBER     Meeting start time (Unix timestamp in milliseconds)
  --end-time INT:NUMBER       Meeting end time (Unix timestamp in milliseconds)
  --meeting-user-list TEXT ...
                              Meeting user list (W3 IDs, can be multiple)
```

### query-list

```text
Query meeting list.
Usage: welink-cli meeting query-list [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --page INT:NUMBER REQUIRED  Page number
  --size INT:NUMBER REQUIRED  Page size
  --meeting-start-time TEXT REQUIRED
                              Meeting start time (string format)
  --meeting-end-time TEXT REQUIRED
                              Meeting end time (string format)
  --type INT:NUMBER REQUIRED  Type(e.g., 0-公开的会议、1-待参加的会议、2-已结束的会议、3-我预定的会议、4-所有的会议、5-我管理的会议)
  --meeting-sort TEXT REQUIRED
                              Meeting sort order(e.g. asc)
```

### topic-create

```text
Create a new topic.
Usage: welink-cli meeting topic-create [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID(e.g., 202674731)
  --topic-name TEXT REQUIRED  Topic name(e.g., 88520416)
  --topic-category TEXT REQUIRED
                              Topic category(e.g., 汇报类、决策类、学习类、研讨类、演示类、审批类)
  --topic-member-list TEXT ... REQUIRED
                              Topic member list (W3 IDs, can be multiple)
```

### topic-delete

```text
Delete a topic.
Usage: welink-cli meeting topic-delete [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID(e.g., 202674731)
  --topic-id INT:NUMBER REQUIRED
                              Topic ID(e.g., 88520416)
```

### topic-update

```text
Update a topic.
Usage: welink-cli meeting topic-update [OPTIONS]

Options:
  -h,--help                   Print this help message and exit
  --meeting-id INT:NUMBER REQUIRED
                              Meeting ID(e.g., 202674731)
  --topic-id INT:NUMBER REQUIRED
                              Topic ID(e.g., 88520416)
  --topic-name TEXT           Topic name
  --topic-category TEXT       Topic category(e.g., 汇报类、决策类、学习类、研讨类、演示类、审批类)
  --topic-member-list TEXT ...
                              Topic member list (W3 IDs, can be multiple)
```
