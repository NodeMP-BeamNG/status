# NodeMP — статус сервисов

Страница [status.nodemp.com](https://status.nodemp.com): работают ли сайт, API и документация NodeMP.
Проверяет [Upptime](https://upptime.js.org) из GitHub Actions каждые 5 минут; сбой открывает issue в
этом репозитории и закрывает его, когда сервис снова отвечает. Ни от одного нашего сервера страница не
зависит.

<!--start: status pages-->
<!--end: status pages-->

- Что проверяется — `.upptimerc.yml`.
- Страница — `index.html` и `web/` (вид как у nodemp.com, шрифты и знак отсюда же). Её публикует
  GitHub Pages прямо из `master`, данные она читает из `history/`, которые пишет Upptime.
- Файлы в `.github/workflows/` генерирует Upptime; руками их не правят.
