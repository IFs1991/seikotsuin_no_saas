'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, Plus, Edit, Trash2, Clock, Package, Ticket } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  description: string;
  duration: number; // 分
  price: number;
  insuranceApplicable: boolean;
  category: 'treatment' | 'massage' | 'rehabilitation' | 'other';
  isActive: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: 'supplement' | 'equipment' | 'accessory' | 'other';
  isActive: boolean;
}

interface Package {
  id: string;
  name: string;
  description: string;
  sessions: number;
  originalPrice: number;
  discountedPrice: number;
  validityPeriod: number; // 日
  services: string[];
  isActive: boolean;
}

export function ServicesPricingSettings() {
  const [services, setServices] = useState<Service[]>([
    {
      id: '1',
      name: '整体治療',
      description: '全身の骨格・筋肉の調整',
      duration: 60,
      price: 5000,
      insuranceApplicable: true,
      category: 'treatment',
      isActive: true,
    },
    {
      id: '2',
      name: 'マッサージ',
      description: 'リラクゼーションマッサージ',
      duration: 45,
      price: 4000,
      insuranceApplicable: false,
      category: 'massage',
      isActive: true,
    },
  ]);

  const [products, setProducts] = useState<Product[]>([
    {
      id: '1',
      name: 'サポーター（膝用）',
      description: '膝の負担を軽減するサポーター',
      price: 2500,
      stock: 15,
      category: 'equipment',
      isActive: true,
    },
    {
      id: '2',
      name: 'グルコサミンサプリ',
      description: '関節の健康をサポート',
      price: 3800,
      stock: 8,
      category: 'supplement',
      isActive: true,
    },
  ]);

  const [packages, setPackages] = useState<Package[]>([
    {
      id: '1',
      name: '整体5回券',
      description: '整体治療5回分のお得なパッケージ',
      sessions: 5,
      originalPrice: 25000,
      discountedPrice: 22000,
      validityPeriod: 90,
      services: ['1'],
      isActive: true,
    },
  ]);

  const [activeTab, setActiveTab] = useState<
    'services' | 'products' | 'packages'
  >('services');
  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const categoryNames = {
    // サービスカテゴリ
    treatment: '治療',
    massage: 'マッサージ',
    rehabilitation: 'リハビリ',
    // 商品カテゴリ
    supplement: 'サプリメント',
    equipment: '器具・用品',
    accessory: 'アクセサリー',
    other: 'その他',
  };

  const handleSave = async () => {
    setIsLoading(true);
    setSavedMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSavedMessage('サービス・料金設定を保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('保存に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleServiceStatus = (serviceId: string) => {
    setServices(prev =>
      prev.map(service =>
        service.id === serviceId
          ? { ...service, isActive: !service.isActive }
          : service
      )
    );
  };

  const toggleProductStatus = (productId: string) => {
    setProducts(prev =>
      prev.map(product =>
        product.id === productId
          ? { ...product, isActive: !product.isActive }
          : product
      )
    );
  };

  const togglePackageStatus = (packageId: string) => {
    setPackages(prev =>
      prev.map(pkg =>
        pkg.id === packageId ? { ...pkg, isActive: !pkg.isActive } : pkg
      )
    );
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

      {/* タブナビゲーション */}
      <div className='border-b border-gray-200'>
        <nav className='-mb-px flex space-x-8'>
          <button
            onClick={() => setActiveTab('services')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'services'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            施術メニュー
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'products'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            物販商品
          </button>
          <button
            onClick={() => setActiveTab('packages')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'packages'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            回数券・パッケージ
          </button>
        </nav>
      </div>

      {/* 施術メニュー */}
      {activeTab === 'services' && (
        <Card className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-semibold text-gray-900'>
              施術メニュー
            </h3>
            <Button className='flex items-center space-x-2'>
              <Plus className='w-4 h-4' />
              <span>新しいメニューを追加</span>
            </Button>
          </div>

          <div className='space-y-4'>
            {services.map(service => (
              <div key={service.id} className='p-4 bg-gray-50 rounded-lg'>
                <div className='flex items-start justify-between mb-3'>
                  <div className='flex-1'>
                    <div className='flex items-center space-x-3 mb-2'>
                      <h4 className='font-medium text-gray-900'>
                        {service.name}
                      </h4>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          service.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {service.isActive ? '有効' : '無効'}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          service.insuranceApplicable
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {service.insuranceApplicable ? '保険適用' : '自費診療'}
                      </span>
                    </div>
                    <p className='text-sm text-gray-600 mb-2'>
                      {service.description}
                    </p>
                    <div className='flex items-center space-x-4 text-sm text-gray-500'>
                      <div className='flex items-center space-x-1'>
                        <Clock className='w-4 h-4' />
                        <span>{service.duration}分</span>
                      </div>
                      <div className='font-medium text-gray-900'>
                        ¥{service.price.toLocaleString()}
                      </div>
                      <div>カテゴリ: {categoryNames[service.category]}</div>
                    </div>
                  </div>
                  <div className='flex items-center space-x-2 ml-4'>
                    <Button variant='outline' size='sm'>
                      <Edit className='w-4 h-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => toggleServiceStatus(service.id)}
                      className={
                        service.isActive ? 'text-red-600' : 'text-green-600'
                      }
                    >
                      {service.isActive ? '無効化' : '有効化'}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      className='text-red-600'
                    >
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 物販商品 */}
      {activeTab === 'products' && (
        <Card className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-semibold text-gray-900'>物販商品</h3>
            <Button className='flex items-center space-x-2'>
              <Plus className='w-4 h-4' />
              <span>新しい商品を追加</span>
            </Button>
          </div>

          <div className='space-y-4'>
            {products.map(product => (
              <div key={product.id} className='p-4 bg-gray-50 rounded-lg'>
                <div className='flex items-start justify-between mb-3'>
                  <div className='flex-1'>
                    <div className='flex items-center space-x-3 mb-2'>
                      <Package className='w-5 h-5 text-blue-600' />
                      <h4 className='font-medium text-gray-900'>
                        {product.name}
                      </h4>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          product.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {product.isActive ? '販売中' : '販売停止'}
                      </span>
                    </div>
                    <p className='text-sm text-gray-600 mb-2'>
                      {product.description}
                    </p>
                    <div className='flex items-center space-x-4 text-sm text-gray-500'>
                      <div className='font-medium text-gray-900'>
                        ¥{product.price.toLocaleString()}
                      </div>
                      <div
                        className={`${product.stock <= 5 ? 'text-red-600 font-medium' : ''}`}
                      >
                        在庫: {product.stock}個
                      </div>
                      <div>カテゴリ: {categoryNames[product.category]}</div>
                    </div>
                  </div>
                  <div className='flex items-center space-x-2 ml-4'>
                    <Button variant='outline' size='sm'>
                      <Edit className='w-4 h-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => toggleProductStatus(product.id)}
                      className={
                        product.isActive ? 'text-red-600' : 'text-green-600'
                      }
                    >
                      {product.isActive ? '販売停止' : '販売開始'}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      className='text-red-600'
                    >
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 回数券・パッケージ */}
      {activeTab === 'packages' && (
        <Card className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-semibold text-gray-900'>
              回数券・パッケージ
            </h3>
            <Button className='flex items-center space-x-2'>
              <Plus className='w-4 h-4' />
              <span>新しいパッケージを追加</span>
            </Button>
          </div>

          <div className='space-y-4'>
            {packages.map(pkg => (
              <div key={pkg.id} className='p-4 bg-gray-50 rounded-lg'>
                <div className='flex items-start justify-between mb-3'>
                  <div className='flex-1'>
                    <div className='flex items-center space-x-3 mb-2'>
                      <Ticket className='w-5 h-5 text-purple-600' />
                      <h4 className='font-medium text-gray-900'>{pkg.name}</h4>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          pkg.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {pkg.isActive ? '販売中' : '販売停止'}
                      </span>
                    </div>
                    <p className='text-sm text-gray-600 mb-2'>
                      {pkg.description}
                    </p>
                    <div className='flex items-center space-x-4 text-sm text-gray-500'>
                      <div>{pkg.sessions}回分</div>
                      <div className='flex items-center space-x-2'>
                        <span className='line-through text-gray-400'>
                          ¥{pkg.originalPrice.toLocaleString()}
                        </span>
                        <span className='font-medium text-red-600'>
                          ¥{pkg.discountedPrice.toLocaleString()}
                        </span>
                        <span className='bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs'>
                          {Math.round(
                            (1 - pkg.discountedPrice / pkg.originalPrice) * 100
                          )}
                          % OFF
                        </span>
                      </div>
                      <div>有効期限: {pkg.validityPeriod}日</div>
                    </div>
                  </div>
                  <div className='flex items-center space-x-2 ml-4'>
                    <Button variant='outline' size='sm'>
                      <Edit className='w-4 h-4' />
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => togglePackageStatus(pkg.id)}
                      className={
                        pkg.isActive ? 'text-red-600' : 'text-green-600'
                      }
                    >
                      {pkg.isActive ? '販売停止' : '販売開始'}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      className='text-red-600'
                    >
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
