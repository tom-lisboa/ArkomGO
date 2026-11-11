package platformidentity

import "testing"

func TestPasswordHashAndBounds(t *testing.T) {
	password := "synthetic-password-only"
	a, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	b, err := HashPassword(password)
	if err != nil || a == b {
		t.Fatal("password salts must differ")
	}
	if !PasswordMatches(password, a) || PasswordMatches("incorrect", a) || PasswordMatches(password, DummyPasswordHash) {
		t.Fatal("password verification failed")
	}
	for _, bad := range []string{"", "pbkdf2_sha256$1$00$00", a + "x"} {
		if PasswordMatches(password, bad) {
			t.Fatal("malformed hash accepted")
		}
	}
	if _, err := HashPassword("short"); err == nil {
		t.Fatal("short password accepted")
	}
}
