import { describe, expect, it } from 'vitest';
import { blankSecrets, includeInScreenshot } from './screenshot';

describe('screenshot filters', () => {
  it('blanks password fields in the copy and leaves other fields alone', () => {
    const password = document.createElement('input');
    password.type = 'password'; password.value = 'Secret-123!'; password.setAttribute('value', 'Secret-123!');
    const email = document.createElement('input');
    email.type = 'email'; email.value = 'anna@example.com';
    blankSecrets(password); blankSecrets(email);
    expect(password.value).toBe('');
    expect(password.getAttribute('value')).toBe('');
    expect(email.value).toBe('anna@example.com');
  });

  it('leaves out elements marked to be excluded', () => {
    const excluded = document.createElement('div');
    excluded.dataset.screenshot = 'exclude';
    expect(includeInScreenshot(excluded)).toBe(false);
    expect(includeInScreenshot(document.createElement('main'))).toBe(true);
    expect(includeInScreenshot(document.createTextNode('text'))).toBe(true);
  });
});
