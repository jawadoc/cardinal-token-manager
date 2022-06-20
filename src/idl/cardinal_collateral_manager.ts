export type CardinalCollateralManager = {
  "version": "1.4.3",
  "name": "cardinal_collateral_manager",
  "instructions": [
    {
      "name": "init",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "issuer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "ix",
          "type": {
            "defined": "InitIx"
          }
        }
      ]
    },
    {
      "name": "deposit",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeCollectorTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "paymentManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerCollateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "recipientTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "claimReceipt",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cardinalPaymentManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "cardinalTokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "returnCollateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "recipientTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collector",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "invalidator",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "close",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collector",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "closer",
          "isMut": true,
          "isSigner": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "collateralManager",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tokenManager",
            "type": "publicKey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "collateralMint",
            "type": "publicKey"
          },
          {
            "name": "paymentManager",
            "type": "publicKey"
          },
          {
            "name": "collector",
            "type": "publicKey"
          },
          {
            "name": "state",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "InitIx",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "collateralMint",
            "type": "publicKey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "paymentManager",
            "type": "publicKey"
          },
          {
            "name": "collector",
            "type": "publicKey"
          }
        ]
      }
    },
    {
      "name": "CollateralManagerState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Initialized"
          },
          {
            "name": "Deposited"
          },
          {
            "name": "Invalidated"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidPaymentTokenAccount",
      "msg": "Token account not owned by the claim approver"
    },
    {
      "code": 6001,
      "name": "InvalidPaymentManagerTokenAccount",
      "msg": "Token account incorrect mint"
    },
    {
      "code": 6002,
      "name": "InvalidPayerTokenAccount",
      "msg": "Token account not owned by the payer"
    },
    {
      "code": 6003,
      "name": "InvalidTokenManager",
      "msg": "Invalid token manager for this claim approver"
    },
    {
      "code": 6004,
      "name": "InvalidIssuer",
      "msg": "Invalid issuer"
    },
    {
      "code": 6005,
      "name": "InvalidCollector",
      "msg": "Invalid collector"
    },
    {
      "code": 6006,
      "name": "AccountDiscriminatorMismatch",
      "msg": "Invalid account discriminator"
    },
    {
      "code": 6007,
      "name": "InvalidPaymentManagerProgram",
      "msg": "Invalid payment manager program"
    },
    {
      "code": 6008,
      "name": "InvalidPaymentManager",
      "msg": "Invalid payment manager"
    },
    {
      "code": 6009,
      "name": "InvalidPaymentMint",
      "msg": "Invalid payment mint"
    },
    {
      "code": 6010,
      "name": "CollateralNotInitialized",
      "msg": "Collateral not initialized"
    },
    {
      "code": 6011,
      "name": "CollateralNotDeposited",
      "msg": "Collateral not deposited"
    },
    {
      "code": 6012,
      "name": "InvalidRecipientTokenAccount",
      "msg": "Token account not owned by recipient"
    }
  ]
};

export const IDL: CardinalCollateralManager = {
  "version": "1.4.3",
  "name": "cardinal_collateral_manager",
  "instructions": [
    {
      "name": "init",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "issuer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "ix",
          "type": {
            "defined": "InitIx"
          }
        }
      ]
    },
    {
      "name": "deposit",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeCollectorTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "paymentManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "payerCollateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "recipientTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "claimReceipt",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "cardinalPaymentManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "cardinalTokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "returnCollateralTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "recipientTokenAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collector",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "invalidator",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "close",
      "accounts": [
        {
          "name": "tokenManager",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "collateralManager",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "collector",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "closer",
          "isMut": true,
          "isSigner": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "collateralManager",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tokenManager",
            "type": "publicKey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "collateralMint",
            "type": "publicKey"
          },
          {
            "name": "paymentManager",
            "type": "publicKey"
          },
          {
            "name": "collector",
            "type": "publicKey"
          },
          {
            "name": "state",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "InitIx",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "collateralMint",
            "type": "publicKey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "paymentManager",
            "type": "publicKey"
          },
          {
            "name": "collector",
            "type": "publicKey"
          }
        ]
      }
    },
    {
      "name": "CollateralManagerState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Initialized"
          },
          {
            "name": "Deposited"
          },
          {
            "name": "Invalidated"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidPaymentTokenAccount",
      "msg": "Token account not owned by the claim approver"
    },
    {
      "code": 6001,
      "name": "InvalidPaymentManagerTokenAccount",
      "msg": "Token account incorrect mint"
    },
    {
      "code": 6002,
      "name": "InvalidPayerTokenAccount",
      "msg": "Token account not owned by the payer"
    },
    {
      "code": 6003,
      "name": "InvalidTokenManager",
      "msg": "Invalid token manager for this claim approver"
    },
    {
      "code": 6004,
      "name": "InvalidIssuer",
      "msg": "Invalid issuer"
    },
    {
      "code": 6005,
      "name": "InvalidCollector",
      "msg": "Invalid collector"
    },
    {
      "code": 6006,
      "name": "AccountDiscriminatorMismatch",
      "msg": "Invalid account discriminator"
    },
    {
      "code": 6007,
      "name": "InvalidPaymentManagerProgram",
      "msg": "Invalid payment manager program"
    },
    {
      "code": 6008,
      "name": "InvalidPaymentManager",
      "msg": "Invalid payment manager"
    },
    {
      "code": 6009,
      "name": "InvalidPaymentMint",
      "msg": "Invalid payment mint"
    },
    {
      "code": 6010,
      "name": "CollateralNotInitialized",
      "msg": "Collateral not initialized"
    },
    {
      "code": 6011,
      "name": "CollateralNotDeposited",
      "msg": "Collateral not deposited"
    },
    {
      "code": 6012,
      "name": "InvalidRecipientTokenAccount",
      "msg": "Token account not owned by recipient"
    }
  ]
};
