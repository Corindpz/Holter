from fastapi import APIRouter, HTTPException
from src.dictionary.dict_manager import DictionaryManager
from src.models import DictionaryEntry

router = APIRouter(tags=["dictionary"])
_dm = DictionaryManager()


@router.get("/dictionary")
async def list_dictionary():
    return _dm.list_all()


@router.post("/dictionary")
async def add_entry(entry: DictionaryEntry):
    try:
        _dm.add(entry)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True}


@router.delete("/dictionary/{pattern}")
async def delete_entry(pattern: str):
    _dm.delete(pattern)
    return {"ok": True}
