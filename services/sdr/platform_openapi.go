package main

import _ "embed"

// This public document describes the client API only. Worker authority is private.
//
//go:embed platform-openapi.json
var platformOpenAPI []byte
