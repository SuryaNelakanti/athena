import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Card, IconButton, Select, Textarea } from '../../components/ui';
import type { Message, MessageRole } from './model';

export interface PlaygroundPromptCardProps {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  messages: Message[];
  contextVisible: boolean;
  onToggleContext: () => void;
  onAddMessage: () => void;
  onClearMessages: () => void;
  onUpdateMessage: (id: string, patch: Partial<Message>) => void;
  onRemoveMessage: (id: string) => void;
}

export const PlaygroundPromptCard = ({
  systemPrompt,
  onSystemPromptChange,
  input,
  onInputChange,
  messages,
  contextVisible,
  onToggleContext,
  onAddMessage,
  onClearMessages,
  onUpdateMessage,
  onRemoveMessage,
}: PlaygroundPromptCardProps) => (
  <Card className='space-y-4'>
    <div className='flex items-start justify-between'>
      <div>
        <h3 className='text-sm font-semibold text-text-main'>Prompt</h3>
        <p className='text-xs text-text-muted mt-1'>
          Define the system instruction and current user input.
        </p>
      </div>
      <Button size='sm' variant='ghost' onClick={onToggleContext}>
        {contextVisible
          ? 'Hide context'
          : messages.length
            ? `Show context (${messages.length})`
            : 'Show context'}
        {contextVisible ? (
          <ChevronUpIcon className='w-4 h-4' />
        ) : (
          <ChevronDownIcon className='w-4 h-4' />
        )}
      </Button>
    </div>

    <div>
      <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>
        System prompt
      </label>
      <Textarea
        className='mt-2'
        value={systemPrompt}
        onChange={(event) => onSystemPromptChange(event.target.value)}
        rows={4}
      />
    </div>

    {contextVisible && (
      <div className='border border-border-base rounded-lg bg-app p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <div>
            <div className='text-xs uppercase tracking-wide font-semibold text-text-muted'>
              Context messages
            </div>
            <div className='text-xs text-text-muted mt-1'>
              Add optional dialogue context before the current input.
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <Button size='sm' variant='secondary' onClick={onAddMessage}>
              <PlusIcon className='w-4 h-4' />
              Add
            </Button>
            <Button size='sm' variant='ghost' onClick={onClearMessages} disabled={!messages.length}>
              Clear
            </Button>
          </div>
        </div>

        {messages.length === 0 && <div className='text-xs text-text-muted'>No context added yet.</div>}

        {messages.map((message) => (
          <div key={message.id} className='grid grid-cols-[120px,1fr,40px] gap-2'>
            <Select
              value={message.role}
              onChange={(event) =>
                onUpdateMessage(message.id, { role: event.target.value as MessageRole })
              }
            >
              <option value='user'>User</option>
              <option value='assistant'>Assistant</option>
            </Select>
            <Textarea
              value={message.content}
              onChange={(event) => onUpdateMessage(message.id, { content: event.target.value })}
              rows={2}
            />
            <IconButton
              size='sm'
              variant='ghost'
              onClick={() => onRemoveMessage(message.id)}
              aria-label='Remove message'
            >
              <XMarkIcon className='w-4 h-4' />
            </IconButton>
          </div>
        ))}
      </div>
    )}

    <div>
      <label className='text-xs text-text-muted font-semibold uppercase tracking-wide'>User input</label>
      <Textarea
        className='mt-2'
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        rows={4}
        placeholder='Ask a question or add a new user prompt...'
      />
    </div>
  </Card>
);
