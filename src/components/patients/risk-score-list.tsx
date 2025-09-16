import React, { useState } from 'react';

const RiskScoreList: React.FC = () => {
  const [selectedPatients, setSelectedPatients] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('risk');
  const [filterRisk, setFilterRisk] = useState('all');

  const patients = [
    {
      id: '1',
      name: '山田 太郎',
      risk: 'high',
      score: 85,
      lastVisit: '2024-03-01',
      factors: ['長期未来院', '治療中断歴あり'],
      phone: '090-1234-5678'
    },
    {
      id: '2',
      name: '鈴木 花子',
      risk: 'medium',
      score: 65,
      lastVisit: '2024-03-10',
      factors: ['予約キャンセル増加'],
      phone: '090-8765-4321'
    },
    {
      id: '3',
      name: '佐藤 次郎',
      risk: 'low',
      score: 25,
      lastVisit: '2024-03-15',
      factors: ['来院頻度低下'],
      phone: '090-5555-5555'
    }
  ];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#22c55e';
      default: return '#6b7280';
    }
  };

  const handleSelectAll = () => {
    if (selectedPatients.length === patients.length) {
      setSelectedPatients([]);
    } else {
      setSelectedPatients(patients.map(p => p.id));
    }
  };

  const handleExportCSV = () => {
    const csvContent = patients
      .map(p => `${p.name},${p.risk},${p.score},${p.lastVisit},${p.factors.join(';')}`)
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'risk-scores.csv';
    a.click();
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-800">
      <Card className="w-full bg-card">
        <CardHeader>
          <CardTitle>離脱リスク患者一覧</CardTitle>
          <CardDescription>患者の離脱リスクスコアとアクション管理</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex justify-between items-center">
            <div className="flex gap-4">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="p-2 border rounded"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
              >
                <option value="risk">リスク順</option>
                <option value="name">名前順</option>
                <option value="lastVisit">最終来院日順</option>
              </select>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="p-2 border rounded"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
              >
                <option value="all">全てのリスク</option>
                <option value="high">高リスク</option>
                <option value="medium">中リスク</option>
                <option value="low">低リスク</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSelectAll}>
                {selectedPatients.length === patients.length ? '全選択解除' : '全選択'}
              </Button>
              <Button onClick={handleExportCSV}>CSVエクスポート</Button>
            </div>
          </div>

          <div className="space-y-4">
            {patients.map((patient) => (
              <Card key={patient.id} className="bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedPatients.includes(patient.id)}
                        onChange={() => {
                          if (selectedPatients.includes(patient.id)) {
                            setSelectedPatients(selectedPatients.filter(id => id !== patient.id));
                          } else {
                            setSelectedPatients([...selectedPatients, patient.id]);
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <div>
                        <h3 className="font-semibold">{patient.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="px-2 py-1 rounded text-sm"
                            style={{
                              backgroundColor: getRiskColor(patient.risk),
                              color: '#ffffff'
                            }}
                          >
                            リスクスコア: {patient.score}
                          </span>
                          <span className="text-sm">最終来院: {patient.lastVisit}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button>
                        <a href={`tel:${patient.phone}`}>電話</a>
                      </Button>
                      <Button>
                        <a href={`/patients/${patient.id}`}>詳細</a>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm">リスク要因:</p>
                    <div className="flex gap-2 mt-1">
                      {patient.factors.map((factor, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 rounded text-sm"
                          style={{ backgroundColor: '#e5e7eb', color: '#374151' }}
                        >
                          {factor}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RiskScoreList;