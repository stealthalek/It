try {
  var storedTheme = localStorage.getItem('ticketing_theme');
  if (storedTheme === 'dark' || storedTheme === 'light') document.documentElement.setAttribute('data-theme', storedTheme);
} catch (e) {}

var fontPreload = document.getElementById('fontPreload');
if (fontPreload) {
  fontPreload.addEventListener('load', function () {
    fontPreload.onload = null;
    fontPreload.rel = 'stylesheet';
  });
}
