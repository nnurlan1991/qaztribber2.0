from backend.app.services.audio import merge_chunk_texts


def test_merge_chunk_texts_removes_overlap() -> None:
    text = merge_chunk_texts(["Сәлем бұл тест", "тест қазақша мәтін"])
    assert text == "Сәлем бұл тест қазақша мәтін"


def test_merge_chunk_texts_keeps_distinct_parts() -> None:
    assert merge_chunk_texts(["Первый фрагмент", "Второй фрагмент"]) == "Первый фрагмент Второй фрагмент"
