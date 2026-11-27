import AccountTreeIcon from '@mui/icons-material/AccountTree'
import AddIcon from '@mui/icons-material/Add'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import EventIcon from '@mui/icons-material/Event'
import EventNoteIcon from '@mui/icons-material/EventNote'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import ViewListIcon from '@mui/icons-material/ViewList'
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Chapter } from '../types'
import {
  formatDiaryDay,
  formatDiaryEntryLabel,
  formatDiaryMonth,
  formatDiaryYear,
  todayKey,
} from '../utils/date'

type DiaryView = 'flat' | 'tree'

/** 视图偏好存在 localStorage，下次打开沿用 */
const VIEW_STORAGE_KEY = 'gfbook.diaryView'

function readStoredView(): DiaryView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'tree' ? 'tree' : 'flat'
  } catch {
    return 'flat'
  }
}

interface DiaryTimelineProps {
  entries: Chapter[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (date: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onChangeDate: (id: string, date: string) => Promise<void>
}

interface DayBucket {
  key: string
  entries: Chapter[]
}

interface MonthBucket {
  key: string
  count: number
  days: DayBucket[]
}

interface YearBucket {
  key: string
  count: number
  months: MonthBucket[]
}

/** 按年、月、日分组；日期倒序，同一天按创建时间正序 */
function groupEntries(entries: Chapter[]): YearBucket[] {
  const sorted = [...entries].sort((a, b) => {
    const byDate = (b.date ?? '').localeCompare(a.date ?? '')
    if (byDate !== 0) return byDate
    return (a.created_time ?? 0) - (b.created_time ?? 0)
  })
  const years: YearBucket[] = []
  for (const entry of sorted) {
    const yearKey = (entry.date ?? '').slice(0, 4)
    const monthKey = (entry.date ?? '').slice(0, 7)
    const dayKey = entry.date ?? ''
    let year = years[years.length - 1]
    if (!year || year.key !== yearKey) {
      year = { key: yearKey, count: 0, months: [] }
      years.push(year)
    }
    let month = year.months[year.months.length - 1]
    if (!month || month.key !== monthKey) {
      month = { key: monthKey, count: 0, days: [] }
      year.months.push(month)
    }
    let day = month.days[month.days.length - 1]
    if (!day || day.key !== dayKey) {
      day = { key: dayKey, entries: [] }
      month.days.push(day)
    }
    day.entries.push(entry)
    month.count++
    year.count++
  }
  return years
}

function TreeHeader({
  collapsed,
  count,
  depth,
  label,
  onToggle,
}: {
  collapsed: boolean
  count: number
  depth: number
  label: string
  onToggle: () => void
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        pl: 0.5 + depth * 1.5,
        pr: 1,
        py: 0.4,
        borderRadius: 1,
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {collapsed ? (
        <ChevronRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
      ) : (
        <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
      )}
      <Typography
        variant="body2"
        color={depth === 0 ? 'text.secondary' : 'text.primary'}
        fontWeight={depth === 0 ? 600 : 500}
        sx={{ flex: 1, minWidth: 0 }}
        noWrap
      >
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {count}
      </Typography>
    </Box>
  )
}

export default function DiaryTimeline({
  entries,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onChangeDate,
}: DiaryTimelineProps) {
  const { t } = useTranslation()
  const [pickOpen, setPickOpen] = useState(false)
  const [pickDate, setPickDate] = useState(() => todayKey())
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [view, setView] = useState<DiaryView>(() => readStoredView())

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [menuEntry, setMenuEntry] = useState<Chapter | null>(null)

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  const [dateId, setDateId] = useState<string | null>(null)
  const [dateValue, setDateValue] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)
  const [savingDate, setSavingDate] = useState(false)

  const years = useMemo(() => groupEntries(entries), [entries])
  const months = useMemo(() => years.flatMap((year) => year.months), [years])
  const today = todayKey()

  /** 同一天有多条时，未自定义标题的条目用「第 n 篇」区分 */
  const entryLabel = (entry: Chapter, dayCount: number, index: number) => {
    const dateKey = entry.date ?? ''
    if (entry.title && entry.title !== dateKey) return entry.title
    if (dayCount > 1) return t('diary.entryIndex', { n: index + 1 })
    return formatDiaryEntryLabel(dateKey, entry.title)
  }

  const handleViewChange = (next: DiaryView | null) => {
    if (!next) return
    setView(next)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // 存储不可用时仅本次会话生效
    }
  }

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handlePickConfirm = () => {
    if (!pickDate) return
    setPickOpen(false)
    onCreate(pickDate)
  }

  const openRename = (entry: Chapter) => {
    setRenameValue(entry.title !== entry.date ? entry.title : '')
    setRenameError(null)
    setRenameId(entry.id)
  }

  const confirmRename = async () => {
    const entry = entries.find((item) => item.id === renameId)
    if (!entry || renaming) return
    const title = renameValue.trim() || entry.date || entry.title
    try {
      setRenaming(true)
      setRenameError(null)
      await onRename(entry.id, title)
      setRenameId(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setRenameError(message || t('diary.updateFailed'))
    } finally {
      setRenaming(false)
    }
  }

  const openChangeDate = (entry: Chapter) => {
    setDateValue(entry.date ?? '')
    setDateError(null)
    setDateId(entry.id)
  }

  const confirmChangeDate = async () => {
    const entry = entries.find((item) => item.id === dateId)
    if (!entry || savingDate) return
    if (!dateValue || dateValue === entry.date) {
      setDateId(null)
      return
    }
    try {
      setSavingDate(true)
      setDateError(null)
      await onChangeDate(entry.id, dateValue)
      setDateId(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setDateError(message || t('diary.updateFailed'))
    } finally {
      setSavingDate(false)
    }
  }

  const renderEntry = (entry: Chapter, indent: number, label: string) => (
    <Box
      key={entry.id}
      onClick={() => onSelect(entry.id)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        ml: indent * 1.5,
        pl: 1,
        pr: 0.5,
        py: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        userSelect: 'none',
        bgcolor: selectedId === entry.id ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
        {label}
      </Typography>
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation()
          setMenuEntry(entry)
          setMenuAnchor(e.currentTarget)
        }}
        sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
      >
        <MoreVertIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} px={1}>
        <Typography variant="subtitle2" color="text.secondary">
          {t('diary.timeline')}
        </Typography>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onCreate(today)}>
            {t('diary.writeToday')}
          </Button>
          <IconButton
            size="small"
            onClick={() => {
              setPickDate(today)
              setPickOpen(true)
            }}
            title={t('diary.pickDate')}
          >
            <EventNoteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      <Box px={1} mb={1.5}>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={view}
          onChange={(_, next: DiaryView | null) => handleViewChange(next)}
        >
          <ToggleButton value="flat">
            <ViewListIcon sx={{ fontSize: 16, mr: 0.5 }} />
            {t('diary.viewFlat')}
          </ToggleButton>
          <ToggleButton value="tree">
            <AccountTreeIcon sx={{ fontSize: 16, mr: 0.5 }} />
            {t('diary.viewTree')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
          {t('diary.empty')}
        </Typography>
      ) : view === 'flat' ? (
        months.map((month) => (
          <Box key={month.key} mb={1.5}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 1, fontWeight: 600, display: 'block', mb: 0.5 }}
            >
              {formatDiaryMonth(month.key)}
            </Typography>
            {month.days.map((day) => {
              const multi = day.entries.length > 1
              return (
                <Box key={day.key}>
                  {multi && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ px: 1, display: 'block', mt: 0.5, fontSize: 11 }}
                    >
                      {formatDiaryDay(day.key)}
                    </Typography>
                  )}
                  {day.entries.map((entry, index) =>
                    renderEntry(
                      entry,
                      multi ? 1 : 0,
                      entryLabel(entry, day.entries.length, index),
                    ),
                  )}
                </Box>
              )
            })}
          </Box>
        ))
      ) : (
        years.map((year) => {
          const yearCollapsed = collapsed.has(year.key)
          return (
            <Box key={year.key} mb={0.5}>
              <TreeHeader
                collapsed={yearCollapsed}
                count={year.count}
                depth={0}
                label={formatDiaryYear(year.key)}
                onToggle={() => toggle(year.key)}
              />
              <Collapse in={!yearCollapsed}>
                {year.months.map((month) => {
                  const monthCollapsed = collapsed.has(month.key)
                  return (
                    <Box key={month.key}>
                      <TreeHeader
                        collapsed={monthCollapsed}
                        count={month.count}
                        depth={1}
                        label={formatDiaryMonth(month.key)}
                        onToggle={() => toggle(month.key)}
                      />
                      <Collapse in={!monthCollapsed}>
                        {month.days.map((day) => {
                          const dayCollapsed = collapsed.has(day.key)
                          return (
                            <Box key={day.key}>
                              <TreeHeader
                                collapsed={dayCollapsed}
                                count={day.entries.length}
                                depth={2}
                                label={formatDiaryDay(day.key)}
                                onToggle={() => toggle(day.key)}
                              />
                              <Collapse in={!dayCollapsed}>
                                {day.entries.map((entry, index) =>
                                  renderEntry(
                                    entry,
                                    3,
                                    entryLabel(
                                      entry,
                                      day.entries.length,
                                      index,
                                    ),
                                  ),
                                )}
                              </Collapse>
                            </Box>
                          )
                        })}
                      </Collapse>
                    </Box>
                  )
                })}
              </Collapse>
            </Box>
          )
        })
      )}

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            if (menuEntry) openRename(menuEntry)
            setMenuAnchor(null)
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2">{t('diary.rename')}</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuEntry) openChangeDate(menuEntry)
            setMenuAnchor(null)
          }}
        >
          <ListItemIcon>
            <EventIcon fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2">{t('diary.changeDate')}</Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuEntry) onDelete(menuEntry.id)
            setMenuAnchor(null)
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error" variant="body2">
            {t('common.delete')}
          </Typography>
        </MenuItem>
      </Menu>

      {/* 新建/跳转日期 */}
      <Dialog
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('diary.pickDate')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            type="date"
            fullWidth
            value={pickDate}
            onChange={(e) => setPickDate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handlePickConfirm()
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handlePickConfirm} variant="contained" disabled={!pickDate}>
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 重命名条目 */}
      <Dialog
        open={!!renameId}
        onClose={() => !renaming && setRenameId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('diary.rename')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('diary.entryTitle')}
            fullWidth
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value)
              if (renameError) setRenameError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmRename()
              }
            }}
            helperText={t('diary.defaultTitleHint')}
            disabled={renaming}
          />
          {renameError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {renameError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameId(null)} disabled={renaming}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirmRename} variant="contained" disabled={renaming}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 更改日期 */}
      <Dialog
        open={!!dateId}
        onClose={() => !savingDate && setDateId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('diary.changeDate')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            type="date"
            fullWidth
            value={dateValue}
            onChange={(e) => {
              setDateValue(e.target.value)
              if (dateError) setDateError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmChangeDate()
              }
            }}
            disabled={savingDate}
          />
          {dateError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {dateError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDateId(null)} disabled={savingDate}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={confirmChangeDate}
            variant="contained"
            disabled={savingDate || !dateValue}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
