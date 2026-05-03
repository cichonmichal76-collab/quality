from sqlalchemy import asc, desc, func
from sqlalchemy.orm import Session

from app.models import ServiceSession


def get_service_session_by_id(db: Session, session_id: str) -> ServiceSession | None:
    return db.query(ServiceSession).filter(ServiceSession.session_id == session_id).first()


def list_service_sessions(
    db: Session,
    *,
    device_serial_number: str | None = None,
) -> list[ServiceSession]:
    query = _apply_service_session_filters(
        db.query(ServiceSession),
        device_serial_number=device_serial_number,
    )
    return query.order_by(ServiceSession.created_at.desc()).all()


def list_service_sessions_queue(
    db: Session,
    *,
    device_serial_number: str | None = None,
    device_type: str | None = None,
    technician_id: str | None = None,
    client_attempt_id: str | None = None,
    upload_correlation_id: str | None = None,
    result: str | None = None,
    upload_status: str | None = None,
    client_trigger_source: str | None = None,
    sort_by: str = "uploaded_at",
    sort_desc: bool = True,
    offset: int = 0,
    limit: int = 100,
) -> dict[str, object]:
    base_query = _apply_service_session_filters(
        db.query(ServiceSession),
        device_serial_number=device_serial_number,
        device_type=device_type,
        technician_id=technician_id,
        client_attempt_id=client_attempt_id,
        upload_correlation_id=upload_correlation_id,
        result=result,
        upload_status=upload_status,
        client_trigger_source=client_trigger_source,
    )
    total_sessions = base_query.count()
    reuploaded_sessions = base_query.filter(ServiceSession.upload_count > 1).count()
    ordered_query = _apply_service_session_sort(
        base_query,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )
    sessions = ordered_query.offset(offset).limit(limit).all()
    has_more = offset + len(sessions) < total_sessions
    next_offset = offset + len(sessions) if has_more else None

    return {
        "total_sessions": total_sessions,
        "reuploaded_sessions": reuploaded_sessions,
        "returned_count": len(sessions),
        "offset": offset,
        "limit": limit,
        "has_more": has_more,
        "next_offset": next_offset,
        "filters": {
            "device_serial_number": device_serial_number,
            "device_type": device_type,
            "technician_id": technician_id,
            "client_attempt_id": client_attempt_id,
            "upload_correlation_id": upload_correlation_id,
            "result": result,
            "upload_status": upload_status,
            "client_trigger_source": client_trigger_source,
            "sort_by": sort_by,
            "sort_desc": sort_desc,
            "offset": offset,
            "limit": limit,
        },
        "upload_status_summary": _build_group_summary(
            base_query,
            ServiceSession.upload_status,
            "upload_status",
        ),
        "result_summary": _build_group_summary(
            base_query,
            ServiceSession.result,
            "result",
        ),
        "device_type_summary": _build_group_summary(
            base_query,
            ServiceSession.device_type,
            "device_type",
        ),
        "technician_summary": _build_group_summary(
            base_query,
            ServiceSession.technician_id,
            "technician_id",
        ),
        "trigger_source_summary": _build_group_summary(
            base_query,
            ServiceSession.client_trigger_source,
            "client_trigger_source",
        ),
        "sessions": sessions,
    }


def _apply_service_session_filters(
    query,
    *,
    device_serial_number: str | None = None,
    device_type: str | None = None,
    technician_id: str | None = None,
    client_attempt_id: str | None = None,
    upload_correlation_id: str | None = None,
    result: str | None = None,
    upload_status: str | None = None,
    client_trigger_source: str | None = None,
):
    if device_serial_number:
        query = query.filter(ServiceSession.device_serial_number == device_serial_number)
    if device_type:
        query = query.filter(ServiceSession.device_type == device_type)
    if technician_id:
        query = query.filter(ServiceSession.technician_id == technician_id)
    if client_attempt_id:
        query = query.filter(ServiceSession.client_attempt_id == client_attempt_id)
    if upload_correlation_id:
        query = query.filter(ServiceSession.upload_correlation_id == upload_correlation_id)
    if result:
        query = query.filter(ServiceSession.result == result)
    if upload_status:
        query = query.filter(ServiceSession.upload_status == upload_status)
    if client_trigger_source:
        query = query.filter(ServiceSession.client_trigger_source == client_trigger_source)
    return query


def _apply_service_session_sort(
    query,
    *,
    sort_by: str,
    sort_desc: bool,
):
    column = {
        "session_id": ServiceSession.session_id,
        "device_serial_number": ServiceSession.device_serial_number,
        "created_at": ServiceSession.created_at,
        "uploaded_at": ServiceSession.uploaded_at,
        "upload_count": ServiceSession.upload_count,
    }[sort_by]
    primary_order = desc(column) if sort_desc else asc(column)
    secondary_order = desc(ServiceSession.created_at) if sort_desc else asc(ServiceSession.created_at)
    tertiary_order = desc(ServiceSession.session_id) if sort_desc else asc(ServiceSession.session_id)
    return query.order_by(column.is_(None), primary_order, secondary_order, tertiary_order)


def _build_group_summary(query, column, label_key: str) -> list[dict[str, object]]:
    rows = (
        query.with_entities(column.label(label_key), func.count(ServiceSession.id).label("session_count"))
        .group_by(column)
        .order_by(column.is_(None), asc(column))
        .all()
    )
    return [
        {
            label_key: value,
            "session_count": session_count,
        }
        for value, session_count in rows
    ]
