from flask import request


def paginate(query, per_page=30):
    """Return (pagination_obj, items). Works on any SQLAlchemy query."""
    page = request.args.get('page', 1, type=int)
    if page < 1:
        page = 1
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    total_pages = max(1, (total + per_page - 1) // per_page)
    return {
        'page': page,
        'per_page': per_page,
        'total': total,
        'total_pages': total_pages,
        'has_prev': page > 1,
        'has_next': page < total_pages,
        'prev_num': page - 1,
        'next_num': page + 1,
        'pages': _page_range(page, total_pages),
    }, items


def _page_range(current, total, window=2):
    """Smart page range: always shows first, last, and window around current."""
    pages = set()
    pages.add(1)
    pages.add(total)
    for i in range(max(1, current - window), min(total, current + window) + 1):
        pages.add(i)
    result = []
    prev = None
    for p in sorted(pages):
        if prev is not None and p - prev > 1:
            result.append(None)  # ellipsis
        result.append(p)
        prev = p
    return result
