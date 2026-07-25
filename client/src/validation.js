// client/src/validation.js

export function validateName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Name is required.';
  }
  if (name.length > 6) {
    return 'Name must be 6 characters or less.';
  }
  if (!/^[A-Za-z]+$/.test(name)) {
    return 'Name can only contain letters.';
  }
  return ''; // valid
}