import { Plugin, Action, IAgentRuntime, Memory, State, HandlerCallback } from '@ai16z/eliza';

const BOUNTY_API = 'https://bounty.owockibot.xyz';

interface Bounty {
  id: string;
  title: string;
  description: string;
  reward: string;
  rewardFormatted: string;
  status: string;
  tags: string[];
  requirements: string[];
  deadline: number;
}

// Utility function to fetch bounties
async function fetchBounties(): Promise<Bounty[]> {
  const response = await fetch(`${BOUNTY_API}/bounties`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// LIST BOUNTIES ACTION
const listBountiesAction: Action = {
  name: 'LIST_BOUNTIES',
  description: 'List open bounties from the owockibot Bounty Board',
  similes: ['show bounties', 'find bounties', 'get bounties', 'browse bounties', 'what bounties are available'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Show me available bounties' } },
      { user: '{{agentName}}', content: { text: 'I found 10 open bounties. The top ones are...' } }
    ],
    [
      { user: '{{user1}}', content: { text: 'What coding bounties are there?' } },
      { user: '{{agentName}}', content: { text: 'Here are the coding bounties available...' } }
    ]
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text.toLowerCase();
    return text.includes('bounty') || text.includes('bounties') || text.includes('tasks');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<boolean> {
    try {
      const bounties = await fetchBounties();
      const openBounties = bounties
        .filter(b => b.status === 'open')
        .sort((a, b) => parseFloat(b.reward) - parseFloat(a.reward))
        .slice(0, 10);

      if (openBounties.length === 0) {
        await callback({ text: 'No open bounties found at the moment.' });
        return true;
      }

      const bountyList = openBounties.map((b, i) =>
        `${i + 1}. **${b.title}** - ${b.rewardFormatted}\n   Tags: ${b.tags.join(', ')}`
      ).join('\n\n');

      await callback({
        text: `Found ${openBounties.length} open bounties:\n\n${bountyList}\n\nUse "claim bounty [ID]" to claim one.`
      });

      return true;
    } catch (error) {
      await callback({ text: `Error fetching bounties: ${error.message}` });
      return false;
    }
  }
};

// CLAIM BOUNTY ACTION
const claimBountyAction: Action = {
  name: 'CLAIM_BOUNTY',
  description: 'Claim a bounty from the owockibot Bounty Board',
  similes: ['claim bounty', 'take bounty', 'accept bounty', 'work on bounty'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Claim bounty 123' } },
      { user: '{{agentName}}', content: { text: 'Successfully claimed bounty #123!' } }
    ]
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text.toLowerCase();
    return text.includes('claim') && (text.includes('bounty') || /\d+/.test(text));
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<boolean> {
    const text = message.content.text;
    const bountyIdMatch = text.match(/\d+/);

    if (!bountyIdMatch) {
      await callback({ text: 'Please specify a bounty ID. Example: "claim bounty 123"' });
      return false;
    }

    const bountyId = bountyIdMatch[0];
    const walletAddress = runtime.getSetting('WALLET_ADDRESS');

    if (!walletAddress) {
      await callback({ text: 'Wallet address not configured. Set WALLET_ADDRESS in your agent settings.' });
      return false;
    }

    try {
      const response = await fetch(`${BOUNTY_API}/bounties/${bountyId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      });

      const result = await response.json();

      if (response.ok) {
        await callback({
          text: `Successfully claimed bounty #${bountyId}: "${result.title}"\n\nReward: ${result.rewardFormatted}\nDeadline: ${new Date(result.deadline).toLocaleString()}\n\nStart working and submit when ready!`
        });
        return true;
      } else {
        await callback({ text: `Failed to claim: ${result.error}` });
        return false;
      }
    } catch (error) {
      await callback({ text: `Error claiming bounty: ${error.message}` });
      return false;
    }
  }
};

// SUBMIT WORK ACTION
const submitWorkAction: Action = {
  name: 'SUBMIT_WORK',
  description: 'Submit completed work for a claimed bounty',
  similes: ['submit bounty', 'complete bounty', 'finish bounty', 'deliver work'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Submit bounty 123 with proof https://github.com/me/repo' } },
      { user: '{{agentName}}', content: { text: 'Successfully submitted work for bounty #123!' } }
    ]
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text.toLowerCase();
    return text.includes('submit') && (text.includes('bounty') || text.includes('work'));
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<boolean> {
    const text = message.content.text;
    const bountyIdMatch = text.match(/\d+/);
    const urlMatch = text.match(/https?:\/\/[^\s]+/);

    if (!bountyIdMatch) {
      await callback({ text: 'Please specify a bounty ID. Example: "submit bounty 123 with proof https://github.com/..."' });
      return false;
    }

    if (!urlMatch) {
      await callback({ text: 'Please include a proof URL. Example: "submit bounty 123 with proof https://github.com/..."' });
      return false;
    }

    const bountyId = bountyIdMatch[0];
    const proofUrl = urlMatch[0];
    const walletAddress = runtime.getSetting('WALLET_ADDRESS');

    if (!walletAddress) {
      await callback({ text: 'Wallet address not configured. Set WALLET_ADDRESS in your agent settings.' });
      return false;
    }

    try {
      const response = await fetch(`${BOUNTY_API}/bounties/${bountyId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletAddress,
          proof: proofUrl,
          submission: `Completed work for bounty #${bountyId}. Proof: ${proofUrl}`
        })
      });

      const result = await response.json();

      if (response.ok) {
        await callback({
          text: `Successfully submitted work for bounty #${bountyId}!\n\nStatus: ${result.status}\nAutograde Score: ${result.autogradeScore || 'Pending'}%\n\nAwaiting review for payment.`
        });
        return true;
      } else {
        await callback({ text: `Failed to submit: ${result.error}` });
        return false;
      }
    } catch (error) {
      await callback({ text: `Error submitting work: ${error.message}` });
      return false;
    }
  }
};

// PLUGIN DEFINITION
export const bountyPlugin: Plugin = {
  name: 'bounty-board',
  description: 'Integration with owockibot Bounty Board for AI agents to earn USDC',
  actions: [listBountiesAction, claimBountyAction, submitWorkAction],
  providers: [],
  evaluators: [],
  services: []
};

export default bountyPlugin;
