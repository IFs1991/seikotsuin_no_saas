'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Save,
  Plus,
  Edit,
  Trash2,
  Mail,
  UserCheck,
  Shield,
  Clock,
} from 'lucide-react';

interface Staff {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'therapist' | 'receptionist' | 'manager';
  status: 'active' | 'inactive' | 'pending';
  joinDate: string;
  permissions: string[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export function StaffManagementSettings() {
  const [staff, setStaff] = useState<Staff[]>([
    {
      id: '1',
      name: '田中 太郎',
      email: 'tanaka@seikotsuin.com',
      role: 'admin',
      status: 'active',
      joinDate: '2023-04-01',
      permissions: ['all'],
    },
    {
      id: '2',
      name: '佐藤 花子',
      email: 'sato@seikotsuin.com',
      role: 'therapist',
      status: 'active',
      joinDate: '2023-06-15',
      permissions: ['patient_management', 'appointments'],
    },
    {
      id: '3',
      name: '山田 次郎',
      email: 'yamada@seikotsuin.com',
      role: 'receptionist',
      status: 'pending',
      joinDate: '2024-01-10',
      permissions: ['appointments', 'basic_info'],
    },
  ]);

  const [roles, setRoles] = useState<Role[]>([
    {
      id: 'admin',
      name: '管理者',
      description: 'システム全体の管理権限',
      permissions: ['all'],
    },
    {
      id: 'manager',
      name: '院長/マネージャー',
      description: '店舗の管理権限',
      permissions: [
        'staff_management',
        'patient_management',
        'reports',
        'settings',
      ],
    },
    {
      id: 'therapist',
      name: '施術スタッフ',
      description: '患者の治療・施術を担当',
      permissions: ['patient_management', 'appointments', 'medical_records'],
    },
    {
      id: 'receptionist',
      name: '受付スタッフ',
      description: '受付業務・予約管理を担当',
      permissions: ['appointments', 'basic_info', 'payments'],
    },
  ]);

  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    role: 'receptionist' as const,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);

  const roleNames = {
    admin: '管理者',
    manager: '院長/マネージャー',
    therapist: '施術スタッフ',
    receptionist: '受付スタッフ',
  };

  const statusNames = {
    active: '有効',
    inactive: '無効',
    pending: '招待中',
  };

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };

  const handleInviteStaff = async () => {
    setIsLoading(true);
    try {
      const staffId = Date.now().toString();
      const role = roles.find(r => r.id === newStaff.role);

      setStaff(prev => [
        ...prev,
        {
          id: staffId,
          name: newStaff.name,
          email: newStaff.email,
          role: newStaff.role,
          status: 'pending',
          joinDate: new Date().toISOString().split('T')[0],
          permissions: role?.permissions || [],
        },
      ]);

      setNewStaff({ name: '', email: '', role: 'receptionist' });
      setShowInviteForm(false);
      setSavedMessage('スタッフに招待メールを送信しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('招待の送信に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStaffStatus = (
    staffId: string,
    newStatus: Staff['status']
  ) => {
    setStaff(prev =>
      prev.map(s => (s.id === staffId ? { ...s, status: newStatus } : s))
    );
  };

  const handleRemoveStaff = (staffId: string) => {
    if (confirm('このスタッフを削除しますか？')) {
      setStaff(prev => prev.filter(s => s.id !== staffId));
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setSavedMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSavedMessage('スタッフ設定を保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('保存に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {savedMessage && (
        <div
          className={`p-4 rounded-md ${
            savedMessage.includes('失敗')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {savedMessage}
        </div>
      )}

      {/* スタッフ招待 */}
      <Card className='p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-semibold text-gray-900'>スタッフ招待</h3>
          <Button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className='flex items-center space-x-2'
          >
            <Plus className='w-4 h-4' />
            <span>新しいスタッフを招待</span>
          </Button>
        </div>

        {showInviteForm && (
          <div className='p-4 bg-gray-50 rounded-lg space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div>
                <Label
                  htmlFor='staffName'
                  className='block text-sm font-medium text-gray-700 mb-1'
                >
                  氏名 <span className='text-red-500'>*</span>
                </Label>
                <Input
                  id='staffName'
                  type='text'
                  value={newStaff.name}
                  onChange={e =>
                    setNewStaff(prev => ({ ...prev, name: e.target.value }))
                  }
                  placeholder='田中 太郎'
                  required
                />
              </div>

              <div>
                <Label
                  htmlFor='staffEmail'
                  className='block text-sm font-medium text-gray-700 mb-1'
                >
                  メールアドレス <span className='text-red-500'>*</span>
                </Label>
                <Input
                  id='staffEmail'
                  type='email'
                  value={newStaff.email}
                  onChange={e =>
                    setNewStaff(prev => ({ ...prev, email: e.target.value }))
                  }
                  placeholder='tanaka@seikotsuin.com'
                  required
                />
              </div>

              <div>
                <Label
                  htmlFor='staffRole'
                  className='block text-sm font-medium text-gray-700 mb-1'
                >
                  役職 <span className='text-red-500'>*</span>
                </Label>
                <select
                  id='staffRole'
                  value={newStaff.role}
                  onChange={e =>
                    setNewStaff(prev => ({
                      ...prev,
                      role: e.target.value as Staff['role'],
                    }))
                  }
                  className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                >
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className='flex justify-end space-x-2'>
              <Button
                variant='outline'
                onClick={() => setShowInviteForm(false)}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleInviteStaff}
                disabled={!newStaff.name || !newStaff.email || isLoading}
                className='flex items-center space-x-2'
              >
                <Mail className='w-4 h-4' />
                <span>{isLoading ? '送信中...' : '招待メール送信'}</span>
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* スタッフ一覧 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          スタッフ一覧
        </h3>

        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-gray-200'>
                <th className='text-left py-3 px-4 font-medium text-gray-900'>
                  氏名
                </th>
                <th className='text-left py-3 px-4 font-medium text-gray-900'>
                  メールアドレス
                </th>
                <th className='text-left py-3 px-4 font-medium text-gray-900'>
                  役職
                </th>
                <th className='text-left py-3 px-4 font-medium text-gray-900'>
                  ステータス
                </th>
                <th className='text-left py-3 px-4 font-medium text-gray-900'>
                  入社日
                </th>
                <th className='text-left py-3 px-4 font-medium text-gray-900'>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <tr key={member.id} className='border-b border-gray-100'>
                  <td className='py-3 px-4 font-medium text-gray-900'>
                    {member.name}
                  </td>
                  <td className='py-3 px-4 text-gray-600'>{member.email}</td>
                  <td className='py-3 px-4 text-gray-600'>
                    {roleNames[member.role]}
                  </td>
                  <td className='py-3 px-4'>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[member.status]}`}
                    >
                      {statusNames[member.status]}
                    </span>
                  </td>
                  <td className='py-3 px-4 text-gray-600'>{member.joinDate}</td>
                  <td className='py-3 px-4'>
                    <div className='flex items-center space-x-2'>
                      {member.status === 'pending' && (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() =>
                            handleUpdateStaffStatus(member.id, 'active')
                          }
                          className='text-green-600 hover:text-green-700'
                        >
                          <UserCheck className='w-4 h-4' />
                        </Button>
                      )}
                      <Button
                        variant='outline'
                        size='sm'
                        className='text-blue-600 hover:text-blue-700'
                      >
                        <Edit className='w-4 h-4' />
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => handleRemoveStaff(member.id)}
                        className='text-red-600 hover:text-red-700'
                      >
                        <Trash2 className='w-4 h-4' />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 権限・ロール設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          権限・ロール設定
        </h3>

        <div className='space-y-4'>
          {roles.map(role => (
            <div key={role.id} className='p-4 bg-gray-50 rounded-lg'>
              <div className='flex items-center justify-between mb-2'>
                <div className='flex items-center space-x-3'>
                  <Shield className='w-5 h-5 text-blue-600' />
                  <h4 className='font-medium text-gray-900'>{role.name}</h4>
                </div>
                <Button variant='outline' size='sm'>
                  <Edit className='w-4 h-4' />
                </Button>
              </div>
              <p className='text-sm text-gray-600 mb-3'>{role.description}</p>
              <div className='flex flex-wrap gap-2'>
                {role.permissions.map(permission => (
                  <span
                    key={permission}
                    className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full'
                  >
                    {permission === 'all' ? '全権限' : permission}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
        <Button variant='outline'>キャンセル</Button>
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className='flex items-center space-x-2'
        >
          <Save className='w-4 h-4' />
          <span>{isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}
