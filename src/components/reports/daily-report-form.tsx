import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('DailyReportForm');

const DailyReportForm: React.FC = () => {
  const [staff, setStaff] = useState('');
  const [menu, setMenu] = useState('');
  const [treatmentTime, setTreatmentTime] = useState('');
  const [nextAppointment, setNextAppointment] = useState('');
  const [patientType, setPatientType] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amount, setAmount] = useState('');

  const handleStaffChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStaff(e.target.value);
  };

  const handleMenuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMenu(e.target.value);
  };

  const handleTreatmentTimeChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setTreatmentTime(e.target.value);
  };

  const handleNextAppointmentChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setNextAppointment(e.target.value);
  };

  const handlePatientTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPatientType(e.target.value);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value);
  };

  const handlePaymentMethodChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setPaymentMethod(e.target.value);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  const calculateAmount = () => {
    // 金額自動計算ロジックをここに実装
    // 例：施術時間とメニューに基づいて金額を計算
    setAmount('1000'); // 仮の金額
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // フォーム送信ロジックをここに実装
    log.info('Form submitted');
  };

  const handleSave = () => {
    // 一時保存ロジックをここに実装
    log.info('Form saved');
  };

  return (
    <div className='flex justify-center mt-4 bg-white dark:bg-gray-800'>
      <Card className='w-full max-w-2xl bg-card'>
        <CardHeader className='bg-card'>
          <CardTitle className='text-lg font-semibold bg-card'>
            日報入力フォーム
          </CardTitle>
          <CardDescription className='bg-card'>
            本日の施術内容を記録してください。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card'>
          <form onSubmit={handleSubmit} className='grid gap-4'>
            <div>
              <Label htmlFor='staff'>施術者</Label>
              <select
                id='staff'
                value={staff}
                onChange={handleStaffChange}
                className='w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              >
                <option value=''>選択してください</option>
                <option value='staff1'>施術者1</option>
                <option value='staff2'>施術者2</option>
              </select>
            </div>
            <div>
              <Label htmlFor='menu'>施術メニュー</Label>
              <select
                id='menu'
                value={menu}
                onChange={handleMenuChange}
                className='w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              >
                <option value=''>選択してください</option>
                <option value='menu1'>メニュー1</option>
                <option value='menu2'>メニュー2</option>
              </select>
            </div>
            <div>
              <Label htmlFor='treatmentTime'>施術時間（分）</Label>
              <Input
                type='number'
                id='treatmentTime'
                value={treatmentTime}
                onChange={handleTreatmentTimeChange}
                className='dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              />
            </div>
            <div>
              <Label htmlFor='nextAppointment'>次回予約</Label>
              <Input
                type='date'
                id='nextAppointment'
                value={nextAppointment}
                onChange={handleNextAppointmentChange}
                className='dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              />
            </div>
            <div>
              <Label htmlFor='patientType'>患者タイプ</Label>
              <select
                id='patientType'
                value={patientType}
                onChange={handlePatientTypeChange}
                className='w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              >
                <option value=''>選択してください</option>
                <option value='new'>新患</option>
                <option value='returning'>再診</option>
              </select>
            </div>
            <div>
              <Label htmlFor='category'>カテゴリー</Label>
              <select
                id='category'
                value={category}
                onChange={handleCategoryChange}
                className='w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              >
                <option value=''>選択してください</option>
                <option value='accident'>事故</option>
                <option value='private'>自費</option>
              </select>
            </div>
            <div>
              <Label htmlFor='paymentMethod'>支払い方法</Label>
              <select
                id='paymentMethod'
                value={paymentMethod}
                onChange={handlePaymentMethodChange}
                className='w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white'
              >
                <option value=''>選択してください</option>
                <option value='cash'>現金</option>
                <option value='card'>カード</option>
              </select>
            </div>
            <div>
              <Label htmlFor='amount'>金額</Label>
              <div className='flex items-center'>
                <Input
                  type='number'
                  id='amount'
                  value={amount}
                  onChange={handleAmountChange}
                  className='dark:bg-gray-700 dark:border-gray-600 dark:text-white'
                />
                <Button
                  type='button'
                  onClick={calculateAmount}
                  className='ml-2'
                >
                  自動計算
                </Button>
              </div>
            </div>
            <div className='flex justify-between'>
              <Button type='button' onClick={handleSave}>
                一時保存
              </Button>
              <Button type='submit'>送信</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyReportForm;
