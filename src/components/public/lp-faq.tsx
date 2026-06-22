'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { faqItems } from './lp-content';

// アコーディオン式FAQ。aria-expanded / aria-controls でアクセシビリティを担保する。
export function LpFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className='flex flex-col border-t border-[#E8E4DE]'>
      {faqItems.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `lp-faq-trigger-${index}`;
        const panelId = `lp-faq-panel-${index}`;
        return (
          <div key={item.question} className='border-b border-[#E8E4DE]'>
            <h3 className='m-0'>
              <button
                id={triggerId}
                type='button'
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className='group flex w-full items-center justify-between gap-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4956C] focus-visible:ring-offset-2 md:py-6'
              >
                <span className='font-serif-jp text-[15px] font-bold leading-[1.5] text-[#1A1A1A] transition-colors group-hover:text-[#C4956C] md:text-[16px]'>
                  {item.question}
                </span>
                <span
                  aria-hidden='true'
                  className={`shrink-0 text-[#2B3A3F] transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}
                >
                  <Plus className='h-5 w-5' />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role='region'
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className='pb-5'
            >
              <p className='border-l-2 border-[#C4956C]/30 pl-4 text-[14px] leading-[1.9] text-[#595959]'>
                {item.answer}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
