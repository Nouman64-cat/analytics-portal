#!/usr/bin/env python3
"""
Create a new user with an auto-generated password.

Usage:
    python create_user.py <email>

The generated password is printed to stdout. Share it securely with the user.
They will be prompted to change it on first login.
"""
import sys
import secrets
import string
from sqlmodel import Session, select

from app.database import engine
from app.models.user import User


def generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def create_user(email: str) -> None:
    import bcrypt
    password = generate_password()
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            print(f"[ERROR] A user with email '{email}' already exists.")
            sys.exit(1)

        user = User(email=email, hashed_password=hashed, must_change_password=True)
        session.add(user)
        session.commit()

    print(f"  User created:  {email}")
    print(f"  Password:      {password}")
    print(f"  Note: user must change password on first login.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python create_user.py <email>")
        sys.exit(1)

    create_user(sys.argv[1])
