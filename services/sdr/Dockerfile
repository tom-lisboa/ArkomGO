FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --chown=nonroot:nonroot sdr-next /app/sdr-next
COPY --chown=nonroot:nonroot frontend/dist /app/frontend/dist
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/sdr-next"]
