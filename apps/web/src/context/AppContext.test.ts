import { describe, expect, it } from 'vitest';
import { constrainTeamMemberInput, type CreateTeamMemberInput } from './AppContext';
import { demoUsers } from '../data/demo';

const input: CreateTeamMemberInput = {
  username: 'new.user', password: 'AtlasSecure2026!', fullName: 'Новый Сотрудник',
  role: 'DIRECTOR', departmentName: '  Продажи  ', jobTitle: 'Менеджер',
};

describe('team onboarding policy', () => {
  it('keeps the director role selection and normalizes the department', () => {
    expect(constrainTeamMemberInput(demoUsers[0], input)).toMatchObject({ role: 'DIRECTOR', departmentName: 'Продажи' });
  });

  it('forces managers to create employees without an arbitrary department', () => {
    expect(constrainTeamMemberInput(demoUsers[1], input)).toMatchObject({ role: 'EMPLOYEE', departmentName: undefined });
  });

  it('rejects employee onboarding attempts', () => {
    expect(() => constrainTeamMemberInput(demoUsers[2], input)).toThrow('Недостаточно прав');
  });
});
