import * as React from "react"
import { cn } from "@/lib/utils"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table"

interface Column {
  key: string
  label: string
  priority: 'high' | 'medium' | 'low' // レスポンシブ優先度
  accessor?: (item: any) => React.ReactNode
  className?: string
}

interface ResponsiveTableProps {
  data: any[]
  columns: Column[]
  className?: string
  mobileLayout?: 'card' | 'accordion' | 'horizontal-scroll'
  onRowClick?: (item: any, index: number) => void
}

export const ResponsiveTable = React.forwardRef<HTMLDivElement, ResponsiveTableProps>(
  ({ 
    data, 
    columns, 
    className, 
    mobileLayout = 'card', 
    onRowClick,
    ...props 
  }, ref) => {
    const [isMobile, setIsMobile] = React.useState(false)

    React.useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768)
      checkMobile()
      window.addEventListener('resize', checkMobile)
      return () => window.removeEventListener('resize', checkMobile)
    }, [])

    if (isMobile && mobileLayout === 'card') {
      return (
        <div ref={ref} className={cn("space-y-3", className)} {...props}>
          {data.map((item, index) => (
            <div
              key={index}
              className={cn(
                "medical-card p-4 space-y-2 cursor-pointer",
                onRowClick && "hover:shadow-medical-lg transition-shadow"
              )}
              onClick={() => onRowClick?.(item, index)}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onRowClick(item, index)
                }
              }}
            >
              {columns
                .filter(col => col.priority === 'high')
                .map((column) => (
                  <div key={column.key} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">
                      {column.label}
                    </span>
                    <span className="text-sm font-semibold">
                      {column.accessor ? column.accessor(item) : item[column.key]}
                    </span>
                  </div>
                ))}
              
              {/* 中優先度データは展開可能 */}
              {columns.some(col => col.priority === 'medium') && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer touch-target">
                    詳細を表示
                  </summary>
                  <div className="mt-2 space-y-1 pl-4">
                    {columns
                      .filter(col => col.priority === 'medium')
                      .map((column) => (
                        <div key={column.key} className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">{column.label}</span>
                          <span>{column.accessor ? column.accessor(item) : item[column.key]}</span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )
    }

    if (isMobile && mobileLayout === 'horizontal-scroll') {
      // 重要な列を固定し、残りを水平スクロール
      const priorityColumns = columns.filter(col => col.priority === 'high')
      const otherColumns = columns.filter(col => col.priority !== 'high')

      return (
        <div ref={ref} className={cn("relative", className)} {...props}>
          <div className="flex border border-gray-200 rounded-medical overflow-hidden">
            {/* 固定列 */}
            <div className="bg-white border-r border-gray-200 flex-shrink-0">
              <Table className="w-auto">
                <TableHeader>
                  <TableRow>
                    {priorityColumns.map((column) => (
                      <TableHead key={column.key} className={cn("sticky left-0 bg-gray-50 z-10", column.className)}>
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow 
                      key={index}
                      onClick={() => onRowClick?.(item, index)}
                      className={onRowClick ? "cursor-pointer" : ""}
                    >
                      {priorityColumns.map((column) => (
                        <TableCell key={column.key} className={cn("sticky left-0 bg-white z-10", column.className)}>
                          {column.accessor ? column.accessor(item) : item[column.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* スクロール可能列 */}
            <div className="overflow-x-auto scrollbar-thin">
              <Table className="w-auto">
                <TableHeader>
                  <TableRow>
                    {otherColumns.map((column) => (
                      <TableHead key={column.key} className={cn("bg-gray-50", column.className)}>
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow 
                      key={index}
                      onClick={() => onRowClick?.(item, index)}
                      className={onRowClick ? "cursor-pointer" : ""}
                    >
                      {otherColumns.map((column) => (
                        <TableCell key={column.key} className={column.className}>
                          {column.accessor ? column.accessor(item) : item[column.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )
    }

    // デスクトップ版は通常のテーブル
    return (
      <div ref={ref} className={cn("medical-card overflow-hidden", className)} {...props}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, index) => (
              <TableRow 
                key={index}
                onClick={() => onRowClick?.(item, index)}
                className={onRowClick ? "cursor-pointer" : ""}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    {column.accessor ? column.accessor(item) : item[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }
)

ResponsiveTable.displayName = "ResponsiveTable"