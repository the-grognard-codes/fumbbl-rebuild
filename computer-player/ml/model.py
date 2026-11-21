import torch
from torch import nn

SCHEMA_VERSION = 1
BOARD_SHAPE = (26, 15, 26)
GLOBALS = 16
CANDIDATES = 12


class Policy(nn.Module):
    def __init__(self, width=32):
        super().__init__()
        self.width = width
        self.trunk = nn.Sequential(nn.Conv2d(26, width, 3, padding=1), nn.ReLU(),
                                   nn.Conv2d(width, width, 3, padding=1), nn.ReLU(),
                                   nn.AdaptiveAvgPool2d((3, 6)), nn.Flatten())
        self.context = nn.Sequential(nn.Linear(width * 18 + GLOBALS, width * 2), nn.ReLU())
        self.policy = nn.Sequential(nn.Linear(width * 2 + CANDIDATES, width), nn.ReLU(), nn.Linear(width, 1))
        self.value = nn.Linear(width * 2, 1)

    def forward(self, board, globals_, candidates, mask):
        context = self.context(torch.cat((self.trunk(board), globals_), dim=-1))
        context_candidates = context.unsqueeze(1).expand(-1, candidates.shape[1], -1)
        logits = self.policy(torch.cat((context_candidates, candidates), dim=-1)).squeeze(-1)
        # -inf keeps padded options impossible under both fp32 and mixed precision.
        return logits.masked_fill(~mask, float('-inf')), self.value(context).squeeze(-1)


def batch(features, device):
    for f in features:
        if f.get('schemaVersion') != SCHEMA_VERSION or len(f['board']) != 26 * 390 or len(f['globals']) != GLOBALS:
            raise ValueError('Unsupported feature schema or shape')
        if not f['candidates'] or any(len(c) != CANDIDATES for c in f['candidates']):
            raise ValueError('Invalid candidate shape')
    maximum = max(len(f['candidates']) for f in features)
    candidates = torch.zeros((len(features), maximum, CANDIDATES), device=device)
    mask = torch.zeros((len(features), maximum), dtype=torch.bool, device=device)
    for i, f in enumerate(features):
        candidates[i, :len(f['candidates'])] = torch.tensor(f['candidates'], device=device, dtype=torch.float32)
        mask[i, :len(f['candidates'])] = True
    board = torch.tensor([f['board'] for f in features], device=device, dtype=torch.float32).reshape(-1, *BOARD_SHAPE)
    globals_ = torch.tensor([f['globals'] for f in features], device=device, dtype=torch.float32)
    if not all(torch.isfinite(t).all() for t in [board, globals_, candidates]):
        raise ValueError('Non-finite features')
    return board, globals_, candidates, mask


def load(path, device):
    checkpoint = torch.load(path, map_location=device, weights_only=True)
    if checkpoint.get('schema_version') != SCHEMA_VERSION:
        raise ValueError('Unsupported checkpoint schema')
    model = Policy(checkpoint['width']).to(device)
    model.load_state_dict(checkpoint['model'])
    return model, checkpoint
