from backend.app.services.gigaam import GigaAMService


def test_model_storage_is_persistent_and_can_be_deleted(tmp_path) -> None:
    service = GigaAMService(tmp_path / "models")
    path = service.model_path("220m")
    path.parent.mkdir(parents=True)
    path.write_bytes(b"saved-model")

    info = service.model_info("220m")
    assert info == {"cached": True, "storage_path": str(path), "size_bytes": 11}

    service.delete("220m")
    assert service.model_info("220m") == {"cached": False, "storage_path": None, "size_bytes": 0}


def test_gigaam_internal_ffmpeg_uses_the_bundled_binary(tmp_path) -> None:
    import gigaam.preprocess as preprocess

    service = GigaAMService(tmp_path / "models")
    service._configure_bundled_ffmpeg()
    result = preprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)

    assert b"ffmpeg version" in result.stdout
