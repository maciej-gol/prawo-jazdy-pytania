# Prawo Jazdy – Testy

Aplikacja webowa do ćwiczenia pytań egzaminacyjnych na prawo jazdy kategorii B.
Hostowana statycznie na GitHub Pages — bez backendu, stan zapisywany w przeglądarce.

**Live:** https://maciej-gol.github.io/prawo-jazdy-pytania/

## Funkcje

- Losowe sesje 32 pytań (20 podstawowych + 12 specjalistycznych) zgodne z formatem egzaminu
- Pytania TAK/NIE i wielokrotnego wyboru (A/B/C) z materiałem multimedialnym (zdjęcia i wideo)
- Natychmiastowy feedback po każdej odpowiedzi
- Podsumowanie sesji z przeglądaniem pytań
- Historia poprzednich sesji (możliwość powtórzenia)
- Statystyki skuteczności dla każdego pytania

## Źródła danych

- Strona Ministerstwa ze szczegółami egzaminu: https://www.gov.pl/web/infrastruktura/prawo-jazdy
- Pytania (xlsx): https://www.gov.pl/attachment/c694a7f2-9374-4f54-94e7-7e52c52f6332
- Multimedia (zip, ≈8.8 GB): https://www.gov.pl/pliki/mi/multimedia_do_pytan.zip

## Konfiguracja (jednorazowo)

### Wymagania

- [uv](https://docs.astral.sh/uv/) (menedżer pakietów Python)
- [Docker](https://docs.docker.com/get-docker/) (do konwersji filmów WMV → WebM)

```bash
# Instalacja uv (jeśli brak):
curl -LsSf https://astral.sh/uv/install.sh | sh

# Sprawdź czy Docker jest dostępny:
docker info
```

### Uruchomienie skryptu konfiguracyjnego

```bash
uv run scripts/setup.py
```

`uv` automatycznie zainstaluje wymagane biblioteki Python (`openpyxl`, `requests`) w izolowanym środowisku.

Skrypt:
1. Pobierze plik pytań (xlsx, ≈1.2 MB)
2. Wygeneruje plik `questions.json` z pytaniami kategorii B
3. Pobierze archiwum multimediów (**≈8.8 GB** — może trwać długo)
4. Wyodrębni zdjęcia JPG do folderu `media/`
5. Wyodrębni pliki WMV do katalogu tymczasowego
6. Zbuduje obraz Docker z ffmpeg i skonwertuje wszystkie filmy **równolegle** (`Dockerfile.converter`)

> **Uwaga:** Pobieranie archiwum multimediów zajmie dużo czasu. Skrypt można przerwać i wznowić — już pobrane i przekonwertowane pliki zostaną pominięte.

## Testowanie lokalne

Po uruchomieniu `setup.py` uruchom lokalny serwer HTTP:

```bash
uv run python -m http.server 8000
```

lub jeśli masz Pythona dostępnego globalnie:

```bash
python -m http.server 8000
```

Następnie otwórz w przeglądarce: **http://localhost:8000**

> **Ważne:** Aplikacja musi być otwarta przez serwer HTTP (nie przez `file://`), ponieważ pobiera plik `questions.json` przez `fetch()`.

## Wdrożenie na GitHub Pages

1. Wykonaj skrypt `setup.py` — pliki `questions.json` i `media/` zostaną wygenerowane lokalnie
2. Zatwierdź i wypchnij zmiany:
   ```bash
   git add questions.json media/
   git commit -m "Add question data and media"
   git push
   ```
3. W ustawieniach repozytorium na GitHub: **Settings → Pages → Source → Deploy from branch → master → / (root)**
4. Poczekaj chwilę — aplikacja będzie dostępna pod adresem:
   `https://<twój-login>.github.io/prawo-jazdy-pytania/`

> **Uwaga dotycząca rozmiaru repozytorium:** Folder `media/` może zawierać setki MB danych. Jeśli GitHub odrzuci push, rozważ użycie [Git LFS](https://git-lfs.github.com/) dla plików w `media/`.

## Uwagi

- **System punktowy:** Oficjalny egzamin używa ważonych punktów (max. 74 pkt, próg 68 pkt). Aplikacja wyświetla wynik procentowy jako przybliżenie.
- **Filmy:** Pliki WMV nie są obsługiwane przez przeglądarki — skrypt konwertuje je do formatu WebM przy użyciu Dockera z ffmpeg. Konwersja odbywa się równolegle (tyle wątków, ile rdzeni CPU). Bez Dockera pytania z filmami wyświetlą się bez materiału wideo.
- **Prywatność:** Wszystkie dane (historia sesji, statystyki) są zapisywane wyłącznie lokalnie w przeglądarce (`localStorage`).
