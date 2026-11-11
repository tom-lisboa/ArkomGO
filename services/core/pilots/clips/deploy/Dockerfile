FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 clips && useradd --uid 10001 --gid clips --no-create-home clips
COPY clips-go /usr/local/bin/clips-go
COPY frontend /srv/clips-ui
RUN chmod 0555 /usr/local/bin/clips-go
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/clips-go"]
