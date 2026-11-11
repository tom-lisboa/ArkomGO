// Package platformidentity contains password primitives shared by the new apps.
package platformidentity

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

const rounds = 600000

func HashPassword(password string) (string, error) {
	if len(password) < 8 || len(password) > 256 {
		return "", errors.New("password_length_8_to_256_required")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, rounds, 32)
	return "pbkdf2_sha256$600000$" + hex.EncodeToString(salt) + "$" + hex.EncodeToString(key), err
}

func PasswordMatches(password, encoded string) bool {
	if len(password) > 256 {
		return false
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" || parts[1] != "600000" {
		return false
	}
	salt, e1 := hex.DecodeString(parts[2])
	want, e2 := hex.DecodeString(parts[3])
	if e1 != nil || e2 != nil || len(salt) != 16 || len(want) != 32 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, rounds, 32)
	return err == nil && hmac.Equal(got, want)
}

// Unknown accounts take the same derivation path as registered accounts.
const DummyPasswordHash = "pbkdf2_sha256$600000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000"
