const fs = require('fs');
const path = require('path');

const mainCss = path.join(__dirname, '../public/css/main.css');
const homeCss = path.join(__dirname, '../public/css/home.css');
const loginView = path.join(__dirname, '../views/auth/login.ejs');
const homeView = path.join(__dirname, '../views/home.ejs');

describe('responsive CSS assets', () => {
  test('main.css and home.css exist for login/home', () => {
    expect(fs.existsSync(mainCss)).toBe(true);
    expect(fs.existsSync(homeCss)).toBe(true);
    expect(fs.existsSync(loginView)).toBe(true);
  });

  test('login view loads the shared stylesheet via head', () => {
    const login = fs.readFileSync(loginView, 'utf8');
    const head = fs.readFileSync(path.join(__dirname, '../views/partials/head.ejs'), 'utf8');
    expect(login).toMatch(/partials\/head/);
    expect(head).toMatch(/css\/main\.css/);
  });

  test('home page exposes a mobile menu toggle', () => {
    const home = fs.readFileSync(homeView, 'utf8');
    expect(home).toMatch(/id="homeNavToggle"/);
    expect(home).toMatch(/id="homeNav"/);
    expect(fs.readFileSync(homeCss, 'utf8')).toMatch(/max-width:\s*767px/);
  });

  test('site CSS documents 768 and 1024 breakpoints', () => {
    const css = fs.readFileSync(mainCss, 'utf8');
    expect(css).toMatch(/max-width:\s*767px/);
    expect(css).toMatch(/max-width:\s*1023px/);
  });
});
