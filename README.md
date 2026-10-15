# NodeMP — статус сервисов

Страница [status.nodemp.com](https://status.nodemp.com): работают ли сайт, вход, список серверов и
документация NodeMP. Проверки идут из GitHub Actions каждые 5 минут, сбой открывает issue в этом
репозитории и закрывает его, когда сервис снова отвечает. Ни от одного нашего сервера страница не
зависит.

<!--start: status pages-->
<!--end: status pages-->

Что проверяется и как выглядит страница — `.upptimerc.yml` (компоненты, тексты) и
`assets/nodemp.css` (тема в цветах сайта, шрифты из `assets/fonts/`). Файлы в `.github/workflows/`
генерирует [Upptime](https://upptime.js.org); руками их не правят.
