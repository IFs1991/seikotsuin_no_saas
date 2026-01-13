'use client';

import React from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import type { Patient } from '@/hooks/usePatientsList';

interface PatientsTableProps {
  patients: Patient[];
  onEdit: (patient: Patient) => void;
}

export function PatientsTable({ patients, onEdit }: PatientsTableProps) {
  if (patients.length === 0) {
    return (
      <div className='text-center py-8 text-gray-500'>
        患者データがありません
      </div>
    );
  }

  return (
    <div data-testid='patients-table'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>氏名</TableHead>
            <TableHead>電話番号</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>メモ</TableHead>
            <TableHead className='w-[80px]'>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patients.map(patient => (
            <TableRow key={patient.id} data-testid='patient-row'>
              <TableCell className='font-medium'>
                <Link
                  href={`/patients/${patient.id}`}
                  className='text-blue-600 hover:underline dark:text-blue-400'
                  aria-label={`View details for ${patient.name}`}
                >
                  {patient.name}
                </Link>
              </TableCell>
              <TableCell>{patient.phone}</TableCell>
              <TableCell>{patient.email ?? '-'}</TableCell>
              <TableCell className='max-w-[200px] truncate'>
                {patient.notes ?? '-'}
              </TableCell>
              <TableCell>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => onEdit(patient)}
                  data-testid='edit-patient-button'
                  aria-label={`${patient.name}を編集`}
                >
                  <Pencil className='h-4 w-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
