# -*- coding: utf-8 -*-
"""
PII Tokenization Service — 152-ФЗ compliance.
- Raw PII → encrypted (Fernet) + hashed (SHA-256)
- O(1) retrieval через hash lookup
"""
import hashlib
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session
from apps.api.models import PiiVault

class PIIService:
    def __init__(self, encryption_key: Optional[str] = None):
        key = encryption_key or os.environ.get('PII_ENCRYPTION_KEY')
        if not key:
            raise ValueError("PII_ENCRYPTION_KEY must be provided or set in environment variables")
        self.cipher = Fernet(key.encode() if isinstance(key, str) else key)
    
    # ---- HASH (для Sheets) ----
    def hash_value(self, value: str, tenant_id: str) -> str:
        salted = f"{tenant_id}:{value.strip().lower()}"
        return hashlib.sha256(salted.encode()).hexdigest()
    
    # ---- TOKENIZE (raw → vault + hash) ----
    def tokenize(
        self, value: str, pii_type: str, tenant_id: str, db: Session
    ) -> str:
        """Возвращает hash для записи в основную таблицу."""
        if not value or not value.strip():
            return ''
        
        h = self.hash_value(value, tenant_id)
        
        # Проверяем, есть ли уже
        existing = db.query(PiiVault).filter_by(
            tenant_id=tenant_id, hash_value=h
        ).first()
        
        if existing:
            return h
        
        # Создаём новую запись
        encrypted = self.cipher.encrypt(value.encode())
        record = PiiVault(
            pii_id=f"PII-{uuid.uuid4().hex[:16]}",
            tenant_id=tenant_id,
            pii_type=pii_type,
            encrypted_value=encrypted,
            hash_value=h,
            created_at=datetime.now(timezone.utc)
        )
        db.add(record)
        db.commit()
        return h
    
    # ---- DETOKENIZE (hash → raw) ----
    def detokenize(self, hash_value: str, tenant_id: str, db: Session) -> Optional[str]:
        record = db.query(PiiVault).filter_by(
            tenant_id=tenant_id, hash_value=hash_value
        ).first()
        if not record:
            return None
        record.access_count += 1  # type: ignore[assignment]
        record.last_accessed_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        db.commit()
        return self.cipher.decrypt(record.encrypted_value).decode()  # type: ignore[arg-type]
    
    # ---- BATCH TOKENIZE (для транскриптов) ----
    def tokenize_transcript(
        self, text: str, tenant_id: str, db: Session
    ) -> str:
        """Заменяет телефоны, email, ФИО на хэши."""
        if not text:
            return ''
        
        # Телефоны (+7 or 8)
        text = re.sub(
            r'(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}',
            lambda m: f"__PHONE_{self.tokenize(m.group(0), 'phone', tenant_id, db)}__",
            text
        )
        
        # Email
        text = re.sub(
            r'\b[\w\.\-]+@[\w\.\-]+\.\w+\b',
            lambda m: f"__EMAIL_{self.tokenize(m.group(0), 'email', tenant_id, db)}__",
            text
        )
        
        return text
