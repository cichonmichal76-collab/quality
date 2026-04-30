from dataclasses import dataclass


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    role: str


def require_role(auth: AuthContext, *allowed_roles: str) -> None:
    if allowed_roles and auth.role not in allowed_roles:
        raise PermissionError(f"Role {auth.role} is not allowed for this operation")

