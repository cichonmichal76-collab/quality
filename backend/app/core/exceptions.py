class DomainError(Exception):
    """Base domain exception for business-rule violations."""


class DomainValidationError(DomainError):
    """Raised when domain validation blocks an operation."""


class TraceabilityConflictError(DomainError):
    """Raised when uniqueness or lifecycle rules are violated."""

